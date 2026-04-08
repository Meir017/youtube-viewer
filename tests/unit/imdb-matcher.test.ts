import { describe, test, expect } from 'bun:test';
import path from 'path';
import { extractTitleCandidates, normalizeTitle, ImdbTitleIndex } from '../../website-tools/imdb-matcher';
import { parseTitleBasics, parseTitleRatings, type ImdbDataset } from '../../website-tools/imdb-parser';

const FIXTURES_DIR = path.join(import.meta.dir, '..', 'fixtures', 'imdb');

describe('extractTitleCandidates', () => {
    test('extracts title from pipe-separated format', () => {
        const { candidates, year } = extractTitleCandidates('Oppenheimer | Official Trailer');
        expect(candidates[0].toLowerCase()).toContain('oppenheimer');
    });

    test('extracts title from pipe-separated with platform', () => {
        const { candidates } = extractTitleCandidates('BEEF: Season 2 | Official Trailer | Netflix');
        expect(candidates.some(c => c.toLowerCase().includes('beef'))).toBe(true);
    });

    test('extracts year from parentheses', () => {
        const { year } = extractTitleCandidates('TOMMY (1975) - Official IMAX Trailer (HD)');
        expect(year).toBe('1975');
    });

    test('extracts title from dash-separated format', () => {
        const { candidates } = extractTitleCandidates('TOMMY (1975) - Official IMAX Trailer (HD)');
        expect(candidates.some(c => c.toLowerCase().includes('tommy'))).toBe(true);
    });

    test('handles em-dash separator', () => {
        const { candidates } = extractTitleCandidates('Masters of The Universe – Official Trailer');
        expect(candidates.some(c => c.toLowerCase().includes('masters of the universe'))).toBe(true);
    });

    test('strips "Official Trailer" text', () => {
        const { candidates } = extractTitleCandidates('COUPLES WEEKEND Official Trailer (2026) Alexandra Daddario');
        expect(candidates.some(c => /couples weekend/i.test(c))).toBe(true);
        expect(candidates.some(c => /official trailer/i.test(c))).toBe(false);
    });

    test('extracts from descriptive first segment', () => {
        const { candidates } = extractTitleCandidates('Bloopers | Percy Jackson and the Olympians | Disney+');
        expect(candidates[0].toLowerCase()).toContain('percy jackson');
    });
});

describe('normalizeTitle', () => {
    test('lowercases and strips punctuation', () => {
        expect(normalizeTitle('The Dark Knight')).toBe('the dark knight');
    });

    test('preserves apostrophes', () => {
        expect(normalizeTitle("Schindler's List")).toBe("schindler's list");
    });

    test('collapses whitespace', () => {
        expect(normalizeTitle('  The   Dark   Knight  ')).toBe('the dark knight');
    });

    test('strips special characters', () => {
        expect(normalizeTitle('Spider-Man: No Way Home')).toBe('spider man no way home');
    });
});

describe('ImdbTitleIndex', () => {
    let dataset: ImdbDataset;
    let index: ImdbTitleIndex;

    // Load fixture data once
    const setup = async () => {
        if (dataset) return;
        const titles = await parseTitleBasics(FIXTURES_DIR);
        const ratings = await parseTitleRatings(FIXTURES_DIR);
        dataset = { titles, ratings, names: new Map(), cast: new Map() };
        index = new ImdbTitleIndex(dataset);
    };

    test('matches exact title', async () => {
        await setup();
        const result = index.match('The Dark Knight | Official Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt0468569');
        expect(result!.title.primaryTitle).toBe('The Dark Knight');
    });

    test('matches with year disambiguation', async () => {
        await setup();
        // There are two "Oppenheimer" entries: 2023 (tt15398776) and 1980 (tt1234567)
        const result = index.match('Oppenheimer (2023) | Official Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt15398776');
        expect(result!.title.startYear).toBe('2023');
    });

    test('prefers higher vote count when no year given', async () => {
        await setup();
        // "Oppenheimer" without year should prefer the one with more votes (tt15398776: 850K vs tt1234567: 200)
        const result = index.match('Oppenheimer | New Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt15398776');
    });

    test('includes rating data in match result', async () => {
        await setup();
        const result = index.match('Inception | Official Trailer');
        expect(result).not.toBeNull();
        expect(result!.rating).toBeDefined();
        expect(result!.rating!.averageRating).toBe('8.8');
        expect(result!.rating!.numVotes).toBe('2400000');
    });

    test('matches TV series titles', async () => {
        await setup();
        const result = index.match('Brooklyn Nine-Nine | Captain Holt Prepares the Squad');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt2467372');
        expect(result!.title.titleType).toBe('tvSeries');
    });

    test('returns null for unmatched titles', async () => {
        await setup();
        const result = index.match('This Movie Does Not Exist At All 2099');
        expect(result).toBeNull();
    });

    test('fuzzy match works for partial titles', async () => {
        await setup();
        const result = index.match('Game of Thrones Season 8 | Official Trailer | HBO');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt0944947');
    });
});
