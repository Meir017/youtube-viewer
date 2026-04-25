/**
 * SQLite-backed IMDB dataset.
 *
 * Wraps `bun:sqlite` with the schema, pragmas, and meta-row helpers used by
 * `import-imdb.ts` (writer) and `imdb-matcher.ts` / `enrich-imdb.ts` (readers).
 *
 * The DB is a build artifact derived from the .tsv.gz files in `data/imdb/`
 * and is rebuilt via `bun run tools:import-imdb`. `isStale()` compares each
 * source file's mtime + size and the schema version against meta rows so we
 * can refuse to enrich against a stale or absent DB.
 */

import { Database } from 'bun:sqlite';
import { existsSync, statSync } from 'fs';
import path from 'path';

/**
 * Bump when the schema or import semantics change in a way that requires
 * existing DBs to be re-imported. `isStale()` flags a mismatch.
 */
export const SCHEMA_VERSION = 1;

/**
 * Source files that must be present in the IMDB directory and whose mtime/size
 * are tracked in `meta` for staleness detection.
 */
export const SOURCE_FILES = [
    'title.basics.tsv.gz',
    'title.ratings.tsv.gz',
    'name.basics.tsv.gz',
    'title.principals.tsv.gz',
] as const;

export type SourceFile = typeof SOURCE_FILES[number];

/**
 * Open (or create) the IMDB SQLite database with sensible pragmas for
 * a write-once / read-many workload.
 */
export function openImdbDb(dbPath: string, opts: { readonly?: boolean; create?: boolean } = {}): Database {
    const db = new Database(dbPath, {
        create: opts.create ?? !opts.readonly,
        readonly: opts.readonly ?? false,
    });
    if (!opts.readonly) {
        db.exec('PRAGMA journal_mode = WAL');
        db.exec('PRAGMA synchronous = NORMAL');
        db.exec('PRAGMA temp_store = MEMORY');
    }
    return db;
}

/**
 * Create the schema if missing. Idempotent — safe to call on an already
 * initialised DB. Seeds `meta.schema_version` if absent.
 */
export function applySchema(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS titles (
            tconst         TEXT PRIMARY KEY,
            titleType      TEXT NOT NULL,
            primaryTitle   TEXT NOT NULL,
            originalTitle  TEXT NOT NULL,
            isAdult        INTEGER NOT NULL,
            startYear      TEXT,
            endYear        TEXT,
            runtimeMinutes TEXT,
            genres         TEXT
        );
        CREATE TABLE IF NOT EXISTS ratings (
            tconst        TEXT PRIMARY KEY,
            averageRating REAL NOT NULL,
            numVotes      INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS names (
            nconst      TEXT PRIMARY KEY,
            primaryName TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS principals (
            tconst   TEXT NOT NULL,
            ordering INTEGER NOT NULL,
            nconst   TEXT NOT NULL,
            category TEXT NOT NULL,
            PRIMARY KEY (tconst, ordering)
        );
        CREATE INDEX IF NOT EXISTS idx_principals_tconst ON principals(tconst);
        CREATE TABLE IF NOT EXISTS title_index (
            norm_title TEXT NOT NULL,
            tconst     TEXT NOT NULL,
            PRIMARY KEY (norm_title, tconst)
        );
        CREATE INDEX IF NOT EXISTS idx_title_index_norm ON title_index(norm_title);
        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    const row = db.query('SELECT value FROM meta WHERE key = ?').get('schema_version') as
        | { value: string }
        | null;
    if (!row) {
        setMeta(db, 'schema_version', String(SCHEMA_VERSION));
    }
}

export function setMeta(db: Database, key: string, value: string): void {
    db.query('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

export function getMeta(db: Database, key: string): string | null {
    const row = db.query('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | null;
    return row ? row.value : null;
}

/**
 * Stamp source-file mtime+size and an `imported_at` timestamp into `meta` so
 * subsequent staleness checks can detect changes.
 */
export function recordSourceFiles(
    db: Database,
    srcDir: string,
    files: readonly string[] = SOURCE_FILES,
): void {
    for (const file of files) {
        const filePath = path.join(srcDir, file);
        if (!existsSync(filePath)) continue;
        const stat = statSync(filePath);
        setMeta(db, `src.${file}.mtime`, String(stat.mtimeMs));
        setMeta(db, `src.${file}.size`, String(stat.size));
    }
    setMeta(db, 'imported_at', new Date().toISOString());
}

export interface StalenessResult {
    stale: boolean;
    reason: string;
}

/**
 * Verify that the DB at `dbPath` was imported from the current set of .tsv.gz
 * files in `srcDir` and matches the current schema version.
 *
 * Returns `{ stale: true, reason }` if the DB is missing, has the wrong schema
 * version, or any tracked source file has a different mtime/size from when it
 * was imported.
 */
export function isStale(dbPath: string, srcDir: string): StalenessResult {
    if (!existsSync(dbPath)) {
        return { stale: true, reason: `database does not exist at ${dbPath}` };
    }

    let db: Database;
    try {
        db = new Database(dbPath, { readonly: true });
    } catch (err) {
        return { stale: true, reason: `cannot open database: ${(err as Error).message}` };
    }

    try {
        const versionRow = db.query('SELECT value FROM meta WHERE key = ?').get('schema_version') as
            | { value: string }
            | null;
        if (!versionRow) {
            return { stale: true, reason: 'meta.schema_version missing — DB not initialised' };
        }
        if (parseInt(versionRow.value, 10) !== SCHEMA_VERSION) {
            return {
                stale: true,
                reason: `schema_version mismatch (db=${versionRow.value}, expected=${SCHEMA_VERSION})`,
            };
        }

        const importedAt = db.query('SELECT value FROM meta WHERE key = ?').get('imported_at') as
            | { value: string }
            | null;
        if (!importedAt) {
            return { stale: true, reason: 'no imported_at marker — DB has not been populated' };
        }

        for (const file of SOURCE_FILES) {
            const filePath = path.join(srcDir, file);
            if (!existsSync(filePath)) {
                return { stale: true, reason: `source file missing: ${file}` };
            }
            const stat = statSync(filePath);
            const mtimeRow = db.query('SELECT value FROM meta WHERE key = ?').get(
                `src.${file}.mtime`,
            ) as { value: string } | null;
            const sizeRow = db.query('SELECT value FROM meta WHERE key = ?').get(
                `src.${file}.size`,
            ) as { value: string } | null;
            if (!mtimeRow || !sizeRow) {
                return { stale: true, reason: `${file} not recorded in meta — re-import needed` };
            }
            if (mtimeRow.value !== String(stat.mtimeMs) || sizeRow.value !== String(stat.size)) {
                return { stale: true, reason: `${file} has changed since last import` };
            }
        }

        return { stale: false, reason: 'up-to-date' };
    } finally {
        db.close();
    }
}
