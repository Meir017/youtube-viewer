import { describe, test, expect, beforeAll } from 'bun:test';
import path from 'path';
import { tmpdir } from 'os';
import { mkdtempSync } from 'fs';
import { runImport } from '../../website-tools/import-imdb';
import { openImdbDb, getMeta, isStale } from '../../website-tools/imdb-db';
import { Database } from 'bun:sqlite';

const FIXTURES_DIR = path.join(import.meta.dir, '..', 'fixtures', 'imdb');

describe('import-imdb: runImport', () => {
    let dbPath: string;
    let db: Database;

    beforeAll(async () => {
        const tmpDir = mkdtempSync(path.join(tmpdir(), 'imdb-import-test-'));
        dbPath = path.join(tmpDir, 'imdb.sqlite');
        await runImport({ imdbDir: FIXTURES_DIR, dbPath, force: true });
        db = openImdbDb(dbPath, { readonly: true });
    });

    test('populates titles table with relevant types only', () => {
        const count = (db.query('SELECT COUNT(*) AS n FROM titles').get() as { n: number }).n;
        // Fixture has 18 relevant titles (8 movies + 6 tvSeries + others) — tvEpisode + short filtered out
        expect(count).toBe(18);

        const oppenheimer = db
            .query('SELECT * FROM titles WHERE tconst = ?')
            .get('tt15398776') as any;
        expect(oppenheimer.primaryTitle).toBe('Oppenheimer');
        expect(oppenheimer.titleType).toBe('movie');
        expect(oppenheimer.startYear).toBe('2023');
        expect(oppenheimer.runtimeMinutes).toBe('180');

        // Filtered-out
        const ep = db.query('SELECT * FROM titles WHERE tconst = ?').get('tt9999999');
        expect(ep).toBeNull();
    });

    test('converts \\N to NULL on import', () => {
        const shawshank = db
            .query('SELECT * FROM titles WHERE tconst = ?')
            .get('tt0111161') as any;
        expect(shawshank.endYear).toBeNull();
    });

    test('populates ratings as numeric types', () => {
        const r = db
            .query('SELECT * FROM ratings WHERE tconst = ?')
            .get('tt15398776') as any;
        expect(r.averageRating).toBe(8.3);
        expect(r.numVotes).toBe(850000);
    });

    test('populates title_index for both primary and original titles', () => {
        const rows = db
            .query('SELECT tconst FROM title_index WHERE norm_title = ?')
            .all('the dark knight') as { tconst: string }[];
        expect(rows.some(r => r.tconst === 'tt0468569')).toBe(true);
    });

    test('populates principals filtered to actor/actress and capped at 5', () => {
        // The Dark Knight fixture has 4 principals: 3 actors + 1 director.
        // Director should be filtered out.
        const rows = db
            .query('SELECT * FROM principals WHERE tconst = ? ORDER BY ordering')
            .all('tt0468569') as any[];
        expect(rows.length).toBe(3);
        expect(rows.every(r => r.category === 'actor' || r.category === 'actress')).toBe(true);
    });

    test('populates names only for referenced nconsts', () => {
        // Christian Bale (referenced) — should be in
        const bale = db.query('SELECT * FROM names WHERE nconst = ?').get('nm0000288') as any;
        expect(bale).not.toBeNull();
        expect(bale.primaryName).toBe('Christian Bale');
    });

    test('records source-file mtime/size + imported_at + schema_version', () => {
        expect(getMeta(db, 'imported_at')).toBeTruthy();
        expect(getMeta(db, 'schema_version')).toBe('1');
        expect(getMeta(db, 'src.title.basics.tsv.gz.mtime')).toBeTruthy();
        expect(getMeta(db, 'src.title.basics.tsv.gz.size')).toBeTruthy();
    });

    test('isStale returns false right after import', () => {
        const result = isStale(dbPath, FIXTURES_DIR);
        expect(result.stale).toBe(false);
    });
});
