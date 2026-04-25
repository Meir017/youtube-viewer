import { describe, test, expect, beforeAll } from 'bun:test';
import path from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, statSync, writeFileSync } from 'fs';
import { Database } from 'bun:sqlite';
import {
    openImdbDb,
    applySchema,
    setMeta,
    getMeta,
    recordSourceFiles,
    isStale,
    SCHEMA_VERSION,
    SOURCE_FILES,
} from '../../website-tools/imdb-db';

const FIXTURES_DIR = path.join(import.meta.dir, '..', 'fixtures', 'imdb');

describe('imdb-db: applySchema', () => {
    test('creates all expected tables and indexes', () => {
        const db = new Database(':memory:');
        applySchema(db);

        const tables = (db.query(
            `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
        ).all() as { name: string }[]).map(r => r.name);

        expect(tables).toContain('titles');
        expect(tables).toContain('ratings');
        expect(tables).toContain('names');
        expect(tables).toContain('principals');
        expect(tables).toContain('title_index');
        expect(tables).toContain('meta');

        const indexes = (db.query(
            `SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`,
        ).all() as { name: string }[]).map(r => r.name);
        expect(indexes).toContain('idx_principals_tconst');
        expect(indexes).toContain('idx_title_index_norm');

        db.close();
    });

    test('seeds schema_version meta row', () => {
        const db = new Database(':memory:');
        applySchema(db);
        expect(getMeta(db, 'schema_version')).toBe(String(SCHEMA_VERSION));
        db.close();
    });

    test('is idempotent — second call does not error', () => {
        const db = new Database(':memory:');
        applySchema(db);
        applySchema(db);
        // Still queryable
        expect(getMeta(db, 'schema_version')).toBe(String(SCHEMA_VERSION));
        db.close();
    });
});

describe('imdb-db: meta helpers', () => {
    test('setMeta + getMeta round-trip', () => {
        const db = new Database(':memory:');
        applySchema(db);
        setMeta(db, 'foo', 'bar');
        expect(getMeta(db, 'foo')).toBe('bar');
        // Overwrite
        setMeta(db, 'foo', 'baz');
        expect(getMeta(db, 'foo')).toBe('baz');
        // Missing → null
        expect(getMeta(db, 'missing')).toBeNull();
        db.close();
    });

    test('recordSourceFiles populates mtime/size + imported_at', () => {
        const db = new Database(':memory:');
        applySchema(db);
        recordSourceFiles(db, FIXTURES_DIR);

        const stat = statSync(path.join(FIXTURES_DIR, 'title.basics.tsv.gz'));
        expect(getMeta(db, 'src.title.basics.tsv.gz.mtime')).toBe(String(stat.mtimeMs));
        expect(getMeta(db, 'src.title.basics.tsv.gz.size')).toBe(String(stat.size));
        expect(getMeta(db, 'imported_at')).toBeTruthy();
        db.close();
    });
});

describe('imdb-db: isStale', () => {
    let tmpDir: string;
    let dbPath: string;

    beforeAll(() => {
        tmpDir = mkdtempSync(path.join(tmpdir(), 'imdb-db-test-'));
        dbPath = path.join(tmpDir, 'imdb.sqlite');
    });

    test('flags missing DB as stale', () => {
        const result = isStale(path.join(tmpDir, 'does-not-exist.sqlite'), FIXTURES_DIR);
        expect(result.stale).toBe(true);
        expect(result.reason).toContain('does not exist');
    });

    test('flags DB without imported_at as stale', () => {
        const tempPath = path.join(tmpDir, 'no-import.sqlite');
        const db = openImdbDb(tempPath);
        applySchema(db);
        // Don't call recordSourceFiles — no imported_at
        db.close();

        const result = isStale(tempPath, FIXTURES_DIR);
        expect(result.stale).toBe(true);
        expect(result.reason).toContain('imported_at');
    });

    test('flags DB with wrong schema_version as stale', () => {
        const tempPath = path.join(tmpDir, 'wrong-version.sqlite');
        const db = openImdbDb(tempPath);
        applySchema(db);
        setMeta(db, 'schema_version', String(SCHEMA_VERSION + 99));
        recordSourceFiles(db, FIXTURES_DIR);
        db.close();

        const result = isStale(tempPath, FIXTURES_DIR);
        expect(result.stale).toBe(true);
        expect(result.reason).toContain('schema_version mismatch');
    });

    test('flags DB as stale when source mtime changed', () => {
        const tempPath = path.join(tmpDir, 'stale-mtime.sqlite');
        const db = openImdbDb(tempPath);
        applySchema(db);
        // Pretend we imported with a different mtime than current.
        for (const file of SOURCE_FILES) {
            setMeta(db, `src.${file}.mtime`, '0');
            const stat = statSync(path.join(FIXTURES_DIR, file));
            setMeta(db, `src.${file}.size`, String(stat.size));
        }
        setMeta(db, 'imported_at', '2020-01-01T00:00:00Z');
        db.close();

        const result = isStale(tempPath, FIXTURES_DIR);
        expect(result.stale).toBe(true);
        expect(result.reason).toMatch(/has changed/);
    });

    test('returns not-stale when mtime + size match', () => {
        const tempPath = path.join(tmpDir, 'fresh.sqlite');
        const db = openImdbDb(tempPath);
        applySchema(db);
        recordSourceFiles(db, FIXTURES_DIR);
        db.close();

        const result = isStale(tempPath, FIXTURES_DIR);
        expect(result.stale).toBe(false);
    });

    test('flags missing source file as stale', () => {
        const emptyDir = mkdtempSync(path.join(tmpdir(), 'imdb-empty-'));
        const tempPath = path.join(tmpDir, 'orphan.sqlite');
        const db = openImdbDb(tempPath);
        applySchema(db);
        recordSourceFiles(db, FIXTURES_DIR);
        db.close();

        const result = isStale(tempPath, emptyDir);
        expect(result.stale).toBe(true);
        expect(result.reason).toContain('source file missing');
    });
});
