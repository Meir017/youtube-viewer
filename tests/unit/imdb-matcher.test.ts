import { describe, test, expect } from 'bun:test';
import path from 'path';
import {
    extractTitleCandidates,
    extractTitleCandidatesFromDescription,
    normalizeTitle,
    ImdbTitleIndex,
} from '../../website-tools/imdb-matcher';
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

    test('does not chop "ft" inside real words like Minecraft', () => {
        // Regression: the "ft./featuring" stripper used to mangle "A Minecraft Movie"
        // into "A Minecra" because "ft " appeared mid-word.
        const { candidates } = extractTitleCandidates('A Minecraft Movie | Final Trailer');
        expect(candidates).toContain('A Minecraft Movie');
    });

    test('still strips trailing " ft./feat./featuring Cast"', () => {
        const { candidates } = extractTitleCandidates('Some Movie - Official Trailer ft. Famous Actor');
        expect(candidates.some(c => /^some movie$/i.test(c))).toBe(true);
        expect(candidates.every(c => !/\bft\.\s+famous/i.test(c))).toBe(true);
    });

    test('preserves title containing possessive: "All\u2019s Fair"', () => {
        // Regression: leading-possessive stripper used to collapse "All's Fair" → "Fair".
        const { candidates } = extractTitleCandidates('All\u2019s Fair | Official Trailer | Hulu');
        expect(candidates.some(c => /all.?s fair/i.test(c))).toBe(true);
    });

    test('still tries possessive-stripped variant for studio prefixes', () => {
        // "Lionsgate's Beast" should still produce "Beast" as an additional candidate.
        const { candidates } = extractTitleCandidates("Lionsgate's Beast | Official Trailer");
        expect(candidates).toContain('Beast');
    });

    test('adds every non-platform pipe segment as a candidate', () => {
        // TV-show clips often put the show name in a later segment.
        const { candidates } = extractTitleCandidates(
            "Li\u2019l Sebastian: The Mini Horse | Parks and Recreation"
        );
        expect(candidates).toContain('Parks and Recreation');
    });

    test('skips pure platform segments from candidates', () => {
        const { candidates } = extractTitleCandidates(
            'The Last of Us Season 2 | Official Trailer | Hulu'
        );
        // "Hulu" should not show up as a standalone candidate
        expect(candidates.every(c => c.toLowerCase() !== 'hulu')).toBe(true);
    });

    test('strips "Cold Opens" show-clip suffix', () => {
        const { candidates } = extractTitleCandidates('Brooklyn Nine-Nine Cold Opens (Season 4)');
        expect(candidates.some(c => /^brooklyn nine.nine$/i.test(c))).toBe(true);
    });

    test('strips "Reunion" / "Podcast" clip suffixes', () => {
        const r1 = extractTitleCandidates('The Traitors Season 4 Reunion');
        expect(r1.candidates.some(c => /^the traitors$/i.test(c))).toBe(true);
        const r2 = extractTitleCandidates('The Last of Us Podcast | Episode 7');
        expect(r2.candidates.some(c => /^the last of us$/i.test(c))).toBe(true);
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

    test('normalizes Unicode curly apostrophes to ASCII', () => {
        // Regression: the previous regex used ASCII apostrophes twice, so curly
        // quotes were never normalized and got stripped by the punctuation pass.
        expect(normalizeTitle('All\u2019s Fair')).toBe("all's fair");
        expect(normalizeTitle("That \u201970s Show")).toBe("that '70s show");
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

    test('matches "A Minecraft Movie | Final Trailer"', async () => {
        await setup();
        const result = index.match('A Minecraft Movie | Final Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt31433814');
    });

    test('matches "All\u2019s Fair | Official Trailer | Hulu" (curly apostrophe)', async () => {
        await setup();
        const result = index.match('All\u2019s Fair | Official Trailer | Hulu');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt26737320');
    });

    test('matches TV show name from later pipe segment', async () => {
        await setup();
        const result = index.match(
            "Li\u2019l Sebastian: The Mini Horse, The Myth, The Legend | Parks and Recreation"
        );
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt0436992');
    });

    test('matches show name from clip title with "Cold Opens" suffix', async () => {
        await setup();
        const result = index.match('Brooklyn Nine-Nine Cold Opens (Season 4)');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt2467372');
    });

    test('falls back to description when the title has no usable signal', async () => {
        await setup();
        // Title with no recognisable movie name — but the description says the show
        const desc = 'Watch Parks and Recreation Streaming on Peacock: https://pck.tv/xyz\n\n#Peacock';
        const result = index.match('Some Weird Clip Name That Does Not Exist', null, desc);
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt0436992');
    });

    test('falls back to hashtag-expanded description candidates', async () => {
        await setup();
        const desc = 'Stuff happens.\n\n#Peacock #BrooklynNineNine #Comedy';
        const result = index.match('A Completely Unrelated Clip Title', null, desc);
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt2467372');
    });

    test('description fallback does not override a good title match', async () => {
        await setup();
        // Title matches Inception; description mentions Oppenheimer.
        const desc = 'Watch Oppenheimer Streaming on Peacock';
        const result = index.match('Inception | Official Trailer', null, desc);
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt1375666');
    });
});

describe('extractTitleCandidatesFromDescription', () => {
    test('extracts "Watch X Streaming on <Platform>"', () => {
        const cands = extractTitleCandidatesFromDescription(
            'Watch The Traitors US Streaming on Peacock: https://pck.tv/abc'
        );
        expect(cands.some(c => /^the traitors(\s+us)?$/i.test(c))).toBe(true);
    });

    test('expands PascalCase hashtags', () => {
        const cands = extractTitleCandidatesFromDescription(
            'Great trailer.\n\n#Peacock #JurassicWorldRebirth #Movies'
        );
        expect(cands).toContain('Jurassic World Rebirth');
        // Platform hashtags are filtered out
        expect(cands.every(c => c.toLowerCase() !== 'peacock')).toBe(true);
    });

    test('skips platform-name noise hashtags', () => {
        const cands = extractTitleCandidatesFromDescription('#Peacock #Hulu #HboMax #Trailer');
        expect(cands).toEqual([]);
    });

    test('extracts quoted titles', () => {
        const cands = extractTitleCandidatesFromDescription(
            'A new look at "Lockerbie: The Untold Story" premiering soon.'
        );
        expect(cands.some(c => /lockerbie/i.test(c))).toBe(true);
    });

    test('returns [] for empty or missing description', () => {
        expect(extractTitleCandidatesFromDescription('')).toEqual([]);
        expect(extractTitleCandidatesFromDescription(undefined as unknown as string)).toEqual([]);
    });
});
