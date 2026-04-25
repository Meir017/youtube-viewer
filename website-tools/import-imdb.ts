#!/usr/bin/env bun
/**
 * Import the IMDB Non-Commercial Datasets into a local SQLite database.
 *
 * Replaces the previous "parse all .tsv.gz files into Maps every run" model
 * with a one-time bulk import. Subsequent enrichment runs query the DB
 * directly.
 *
 * Usage:
 *   bun run website-tools/import-imdb.ts [options]
 *
 * Options:
 *   --imdb-dir=<dir>    Directory of .tsv.gz files (default: data/imdb)
 *   --db=<path>         Output SQLite path (default: <imdb-dir>/imdb.sqlite)
 *   --force             Re-import even if the DB is already up-to-date
 *   --help, -h          Show this help message
 *
 * Schema/staleness logic lives in `imdb-db.ts`. Source files required:
 *   title.basics.tsv.gz, title.ratings.tsv.gz,
 *   name.basics.tsv.gz, title.principals.tsv.gz
 */

import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Database } from 'bun:sqlite';
import { processGzipTsv, isImdbNull } from './imdb-parser';
import {
    openImdbDb,
    applySchema,
    isStale,
    recordSourceFiles,
    SOURCE_FILES,
} from './imdb-db';
import { normalizeTitle } from './imdb-matcher';

// ── Constants ────────────────────────────────────────────────────────

// titleType values we care about for movie/TV enrichment.
const RELEVANT_TITLE_TYPES = new Set([
    'movie',
    'tvSeries',
    'tvMiniSeries',
    'tvMovie',
    'tvSpecial',
]);

const MAX_CAST_PER_TITLE = 5;

// ── Colours ──────────────────────────────────────────────────────────
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};

// ── CLI args ─────────────────────────────────────────────────────────

interface CliArgs {
    imdbDir: string;
    dbPath: string;
    force: boolean;
}

function parseArgs(): CliArgs {
    const args = process.argv.slice(2);
    let imdbDir = path.join(import.meta.dir, '..', 'data', 'imdb');
    let dbPath: string | null = null;
    let force = false;

    for (const arg of args) {
        if (arg.startsWith('--imdb-dir=')) {
            imdbDir = path.resolve(arg.split('=')[1]);
        } else if (arg.startsWith('--db=')) {
            dbPath = path.resolve(arg.split('=')[1]);
        } else if (arg === '--force') {
            force = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
${c.bold}IMDB SQLite Importer${c.reset}

${c.dim}Imports IMDB .tsv.gz datasets into a local SQLite database
for fast offline enrichment.${c.reset}

${c.bold}Usage:${c.reset}
  bun run website-tools/import-imdb.ts [options]

${c.bold}Options:${c.reset}
  --imdb-dir=<dir>    Directory of .tsv.gz files (default: data/imdb)
  --db=<path>         Output SQLite path (default: <imdb-dir>/imdb.sqlite)
  --force             Re-import even if the DB is already up-to-date
  --help, -h          Show this help message

${c.bold}Required source files in --imdb-dir:${c.reset}
  ${SOURCE_FILES.join('\n  ')}

${c.dim}Run tools:download-imdb first to fetch them.${c.reset}
`);
            process.exit(0);
        }
    }

    return {
        imdbDir,
        dbPath: dbPath ?? path.join(imdbDir, 'imdb.sqlite'),
        force,
    };
}

// ── Import phases ────────────────────────────────────────────────────

/**
 * Import title.basics: filter by titleType, insert into `titles` and
 * `title_index`. Returns the set of relevant tconsts so subsequent phases
 * can filter principals.
 */
async function importTitles(db: Database, imdbDir: string): Promise<Set<string>> {
    const filePath = path.join(imdbDir, 'title.basics.tsv.gz');
    const insertTitle = db.prepare(
        `INSERT OR REPLACE INTO titles
         (tconst, titleType, primaryTitle, originalTitle, isAdult, startYear, endYear, runtimeMinutes, genres)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertIndex = db.prepare(
        `INSERT OR IGNORE INTO title_index (norm_title, tconst) VALUES (?, ?)`,
    );

    const relevantTconsts = new Set<string>();
    let kept = 0;
    let scanned = 0;

    // Buffer rows, flush in transactions for ~100x bulk-insert speedup.
    const BATCH_SIZE = 10_000;
    type TitleRow = [string, string, string, string, number, string | null, string | null, string | null, string | null];
    let buffer: TitleRow[] = [];

    const flush = db.transaction((rows: TitleRow[]) => {
        for (const row of rows) {
            insertTitle.run(...row);
            const primaryNorm = normalizeTitle(row[2]);
            const originalNorm = normalizeTitle(row[3]);
            if (primaryNorm) insertIndex.run(primaryNorm, row[0]);
            if (originalNorm && originalNorm !== primaryNorm) insertIndex.run(originalNorm, row[0]);
        }
    });

    await processGzipTsv(filePath, (cols) => {
        scanned++;
        const titleType = cols[1];
        if (!RELEVANT_TITLE_TYPES.has(titleType)) return;

        const tconst = cols[0];
        relevantTconsts.add(tconst);
        kept++;

        const isAdult = parseInt(cols[4], 10) || 0;
        buffer.push([
            tconst,
            titleType,
            cols[2],
            cols[3],
            isAdult,
            isImdbNull(cols[5]) ? null : cols[5],
            isImdbNull(cols[6]) ? null : cols[6],
            isImdbNull(cols[7]) ? null : cols[7],
            isImdbNull(cols[8]) ? null : cols[8],
        ]);

        if (buffer.length >= BATCH_SIZE) {
            flush(buffer);
            buffer = [];
        }
    }, '  📥 title.basics → SQLite');

    if (buffer.length > 0) flush(buffer);

    console.log(`   ${c.dim}scanned ${scanned.toLocaleString()} rows, kept ${kept.toLocaleString()} relevant titles${c.reset}`);
    return relevantTconsts;
}

/**
 * Import title.ratings: insert all ratings (small file).
 */
async function importRatings(db: Database, imdbDir: string): Promise<void> {
    const filePath = path.join(imdbDir, 'title.ratings.tsv.gz');
    const insert = db.prepare(
        `INSERT OR REPLACE INTO ratings (tconst, averageRating, numVotes) VALUES (?, ?, ?)`,
    );

    const BATCH_SIZE = 10_000;
    type RatingRow = [string, number, number];
    let buffer: RatingRow[] = [];
    let inserted = 0;

    const flush = db.transaction((rows: RatingRow[]) => {
        for (const row of rows) insert.run(...row);
    });

    await processGzipTsv(filePath, (cols) => {
        const rating = parseFloat(cols[1]);
        const votes = parseInt(cols[2], 10);
        if (!Number.isFinite(rating) || !Number.isFinite(votes)) return;
        buffer.push([cols[0], rating, votes]);
        inserted++;

        if (buffer.length >= BATCH_SIZE) {
            flush(buffer);
            buffer = [];
        }
    }, '  📥 title.ratings → SQLite');

    if (buffer.length > 0) flush(buffer);

    console.log(`   ${c.dim}inserted ${inserted.toLocaleString()} ratings${c.reset}`);
}

/**
 * Import title.principals: keep only actor/actress rows for relevant tconsts,
 * cap at MAX_CAST_PER_TITLE per title (taking the lowest orderings first,
 * which the source file is already sorted by). Returns the set of nconsts
 * referenced so name.basics can filter.
 */
async function importPrincipals(
    db: Database,
    imdbDir: string,
    relevantTconsts: Set<string>,
): Promise<Set<string>> {
    const filePath = path.join(imdbDir, 'title.principals.tsv.gz');
    const insert = db.prepare(
        `INSERT OR REPLACE INTO principals (tconst, ordering, nconst, category) VALUES (?, ?, ?, ?)`,
    );

    const referencedNconsts = new Set<string>();
    const perTitleCount = new Map<string, number>();

    const BATCH_SIZE = 10_000;
    type PrincipalRow = [string, number, string, string];
    let buffer: PrincipalRow[] = [];
    let kept = 0;
    let scanned = 0;

    const flush = db.transaction((rows: PrincipalRow[]) => {
        for (const row of rows) insert.run(...row);
    });

    await processGzipTsv(filePath, (cols) => {
        scanned++;
        const tconst = cols[0];
        if (!relevantTconsts.has(tconst)) return;

        const category = cols[3];
        if (category !== 'actor' && category !== 'actress') return;

        const count = perTitleCount.get(tconst) ?? 0;
        if (count >= MAX_CAST_PER_TITLE) return;

        const ordering = parseInt(cols[1], 10) || 0;
        const nconst = cols[2];

        buffer.push([tconst, ordering, nconst, category]);
        referencedNconsts.add(nconst);
        perTitleCount.set(tconst, count + 1);
        kept++;

        if (buffer.length >= BATCH_SIZE) {
            flush(buffer);
            buffer = [];
        }
    }, '  📥 title.principals → SQLite');

    if (buffer.length > 0) flush(buffer);

    console.log(
        `   ${c.dim}scanned ${scanned.toLocaleString()} rows, kept ${kept.toLocaleString()} cast entries for ${perTitleCount.size.toLocaleString()} titles${c.reset}`,
    );
    return referencedNconsts;
}

/**
 * Import name.basics: only keep names referenced by `principals`.
 */
async function importNames(
    db: Database,
    imdbDir: string,
    referencedNconsts: Set<string>,
): Promise<void> {
    const filePath = path.join(imdbDir, 'name.basics.tsv.gz');
    const insert = db.prepare(
        `INSERT OR REPLACE INTO names (nconst, primaryName) VALUES (?, ?)`,
    );

    const BATCH_SIZE = 10_000;
    type NameRow = [string, string];
    let buffer: NameRow[] = [];
    let kept = 0;
    let scanned = 0;

    const flush = db.transaction((rows: NameRow[]) => {
        for (const row of rows) insert.run(...row);
    });

    await processGzipTsv(filePath, (cols) => {
        scanned++;
        const nconst = cols[0];
        if (!referencedNconsts.has(nconst)) return;
        buffer.push([nconst, cols[1]]);
        kept++;

        if (buffer.length >= BATCH_SIZE) {
            flush(buffer);
            buffer = [];
        }
    }, '  📥 name.basics → SQLite');

    if (buffer.length > 0) flush(buffer);

    console.log(`   ${c.dim}scanned ${scanned.toLocaleString()} rows, kept ${kept.toLocaleString()} names${c.reset}`);
}

// ── Main entry ───────────────────────────────────────────────────────

/**
 * Run a full import. Exposed for testing — the CLI just calls this with
 * args parsed from argv.
 */
export async function runImport(opts: { imdbDir: string; dbPath: string; force: boolean }): Promise<void> {
    const { imdbDir, dbPath, force } = opts;

    // Verify source files exist
    for (const file of SOURCE_FILES) {
        if (!existsSync(path.join(imdbDir, file))) {
            console.error(`${c.red}❌ Missing source file: ${file}${c.reset}`);
            console.error(`${c.dim}   Run: bun run tools:download-imdb${c.reset}`);
            process.exit(1);
        }
    }

    // Skip import when DB already matches the sources, unless --force.
    if (!force) {
        const staleness = isStale(dbPath, imdbDir);
        if (!staleness.stale) {
            console.log(`${c.green}✓ DB is already up-to-date${c.reset} ${c.dim}(${dbPath})${c.reset}`);
            console.log(`${c.dim}  Use --force to re-import${c.reset}`);
            return;
        }
        console.log(`${c.yellow}⟳ DB needs import: ${staleness.reason}${c.reset}`);
    } else {
        console.log(`${c.yellow}⟳ --force: re-importing${c.reset}`);
    }

    // Ensure parent dir exists
    const parent = path.dirname(dbPath);
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

    const db = openImdbDb(dbPath);
    try {
        applySchema(db);

        // Wipe existing data — we re-derive everything from .tsv.gz.
        db.exec(`DELETE FROM titles; DELETE FROM ratings; DELETE FROM names; DELETE FROM principals; DELETE FROM title_index;`);

        const start = Date.now();
        console.log();

        const relevantTconsts = await importTitles(db, imdbDir);
        await importRatings(db, imdbDir);
        const referencedNconsts = await importPrincipals(db, imdbDir, relevantTconsts);
        await importNames(db, imdbDir, referencedNconsts);

        recordSourceFiles(db, imdbDir);

        console.log();
        console.log(
            `${c.green}✓ Import complete${c.reset} ${c.dim}in ${formatDuration(Date.now() - start)}${c.reset}`,
        );

        // Quick sanity counts
        const titleCount = (db.query('SELECT COUNT(*) AS n FROM titles').get() as { n: number }).n;
        const ratingCount = (db.query('SELECT COUNT(*) AS n FROM ratings').get() as { n: number }).n;
        const nameCount = (db.query('SELECT COUNT(*) AS n FROM names').get() as { n: number }).n;
        const principalsCount = (db.query('SELECT COUNT(*) AS n FROM principals').get() as { n: number }).n;
        const indexCount = (db.query('SELECT COUNT(*) AS n FROM title_index').get() as { n: number }).n;
        console.log(
            `   ${c.dim}titles=${titleCount.toLocaleString()} ratings=${ratingCount.toLocaleString()} names=${nameCount.toLocaleString()} principals=${principalsCount.toLocaleString()} title_index=${indexCount.toLocaleString()}${c.reset}`,
        );
    } finally {
        db.close();
    }
}

function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

// ── CLI ──────────────────────────────────────────────────────────────

if (import.meta.main) {
    const args = parseArgs();

    console.log();
    console.log(`${c.bold}${c.cyan}╔════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bold}${c.cyan}║              IMDB SQLite Importer                      ║${c.reset}`);
    console.log(`${c.bold}${c.cyan}╚════════════════════════════════════════════════════════╝${c.reset}`);
    console.log();
    console.log(`${c.dim}📂 IMDB dir:${c.reset} ${args.imdbDir}`);
    console.log(`${c.dim}🗃  DB path:${c.reset}  ${args.dbPath}`);
    console.log();

    runImport(args).catch(err => {
        console.error(`${c.red}Fatal error:${c.reset}`, err);
        process.exit(1);
    });
}
