import { describe, test, expect, beforeAll } from 'bun:test';
import path from 'path';
import { tmpdir } from 'os';
import { mkdtempSync } from 'fs';
import {
    extractTitleCandidates,
    extractTitleCandidatesFromDescription,
    extractHashtagSet,
    hasTvSeriesSignal,
    isNoiseCandidate,
    isTvFamilyType,
    normalizeTitle,
    yearDistancePenalty,
    tvAwareYearPenalty,
    ImdbTitleIndex,
} from '../../website-tools/imdb-matcher';
import { openImdbDb } from '../../website-tools/imdb-db';
import { runImport } from '../../website-tools/import-imdb';
import type { Database } from 'bun:sqlite';

const FIXTURES_DIR = path.join(import.meta.dir, '..', 'fixtures', 'imdb');

describe('extractTitleCandidates', () => {
    test('extracts title from pipe-separated format', () => {
        const { candidates } = extractTitleCandidates('Oppenheimer | Official Trailer');
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
        const { candidates } = extractTitleCandidates('A Minecraft Movie | Final Trailer');
        expect(candidates).toContain('A Minecraft Movie');
    });

    test('still strips trailing " ft./feat./featuring Cast"', () => {
        const { candidates } = extractTitleCandidates('Some Movie - Official Trailer ft. Famous Actor');
        expect(candidates.some(c => /^some movie$/i.test(c))).toBe(true);
        expect(candidates.every(c => !/\bft\.\s+famous/i.test(c))).toBe(true);
    });

    test('preserves title containing possessive: "All\u2019s Fair"', () => {
        const { candidates } = extractTitleCandidates('All\u2019s Fair | Official Trailer | Hulu');
        expect(candidates.some(c => /all.?s fair/i.test(c))).toBe(true);
    });

    test('still tries possessive-stripped variant for studio prefixes', () => {
        const { candidates } = extractTitleCandidates("Lionsgate's Beast | Official Trailer");
        expect(candidates).toContain('Beast');
    });

    test('adds every non-platform pipe segment as a candidate', () => {
        const { candidates } = extractTitleCandidates(
            "Li\u2019l Sebastian: The Mini Horse | Parks and Recreation"
        );
        expect(candidates).toContain('Parks and Recreation');
    });

    test('skips pure platform segments from candidates', () => {
        const { candidates } = extractTitleCandidates(
            'The Last of Us Season 2 | Official Trailer | Hulu'
        );
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
        expect(normalizeTitle('All\u2019s Fair')).toBe("all's fair");
        expect(normalizeTitle("That \u201970s Show")).toBe("that '70s show");
    });
});

describe('ImdbTitleIndex (SQLite-backed)', () => {
    let db: Database;
    let index: ImdbTitleIndex;

    beforeAll(async () => {
        const tmpDir = mkdtempSync(path.join(tmpdir(), 'imdb-matcher-test-'));
        const dbPath = path.join(tmpDir, 'imdb.sqlite');
        await runImport({ imdbDir: FIXTURES_DIR, dbPath, force: true });
        db = openImdbDb(dbPath, { readonly: true });
        index = new ImdbTitleIndex(db);
    });

    test('matches exact title', () => {
        const result = index.match('The Dark Knight | Official Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt0468569');
        expect(result!.title.primaryTitle).toBe('The Dark Knight');
    });

    test('matches with year disambiguation', () => {
        const result = index.match('Oppenheimer (2023) | Official Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt15398776');
        expect(result!.title.startYear).toBe('2023');
    });

    test('prefers higher vote count when no year given', () => {
        const result = index.match('Oppenheimer | New Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt15398776');
    });

    test('includes rating data in match result', () => {
        const result = index.match('Inception | Official Trailer');
        expect(result).not.toBeNull();
        expect(result!.title.averageRating).toBe(8.8);
        expect(result!.title.numVotes).toBe(2400000);
    });

    test('matches TV series titles', () => {
        const result = index.match('Brooklyn Nine-Nine | Captain Holt Prepares the Squad');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt2467372');
        expect(result!.title.titleType).toBe('tvSeries');
    });

    test('returns null for unmatched titles', () => {
        const result = index.match('This Movie Does Not Exist At All 2099');
        expect(result).toBeNull();
    });

    test('fuzzy match works for partial titles', () => {
        const result = index.match('Game of Thrones Season 8 | Official Trailer | HBO');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt0944947');
    });

    test('matches "A Minecraft Movie | Final Trailer"', () => {
        const result = index.match('A Minecraft Movie | Final Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt31433814');
    });

    test('matches "All\u2019s Fair | Official Trailer | Hulu" (curly apostrophe)', () => {
        const result = index.match('All\u2019s Fair | Official Trailer | Hulu');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt26737320');
    });

    test('matches TV show name from later pipe segment', () => {
        const result = index.match(
            "Li\u2019l Sebastian: The Mini Horse, The Myth, The Legend | Parks and Recreation"
        );
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt0436992');
    });

    test('matches show name from clip title with "Cold Opens" suffix', () => {
        const result = index.match('Brooklyn Nine-Nine Cold Opens (Season 4)');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt2467372');
    });

    test('falls back to description when the title has no usable signal', () => {
        const desc = 'Watch Parks and Recreation Streaming on Peacock: https://pck.tv/xyz\n\n#Peacock';
        const result = index.match('Some Weird Clip Name That Does Not Exist', null, desc);
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt0436992');
    });

    test('falls back to hashtag-expanded description candidates', () => {
        const desc = 'Stuff happens.\n\n#Peacock #BrooklynNineNine #Comedy';
        const result = index.match('A Completely Unrelated Clip Title', null, desc);
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt2467372');
    });

    test('description fallback does not override a good title match', () => {
        const desc = 'Watch Oppenheimer Streaming on Peacock';
        const result = index.match('Inception | Official Trailer', null, desc);
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt1375666');
    });

    test('resolves cast names via SQL JOIN', () => {
        const result = index.match('The Dark Knight | Official Trailer');
        expect(result).not.toBeNull();
        // Fixture has 3 actors for tt0468569, ordered by ordering.
        expect(result!.castNames).toEqual(['Christian Bale', 'Heath Ledger', 'Michael Caine']);
    });

    test('returns empty cast for titles with no principals', () => {
        // Shawshank has no principals in fixture
        const result = index.match('The Shawshank Redemption | Trailer');
        expect(result).not.toBeNull();
        expect(result!.castNames).toEqual([]);
    });

    test('publishYear breaks ties toward the modern same-titled film', () => {
        // Fixture has Beast (1962, 50k votes) and Beast (2024, 5k votes).
        // Without publishYear the old high-vote film wins; with publishYear=2024
        // the year-distance penalty must overcome the vote advantage.
        const noYear = index.match('Beast | Official Trailer');
        expect(noYear).not.toBeNull();
        expect(noYear!.tconst).toBe('tt9000001'); // 1962, more votes

        const withYear = index.match('Beast | Official Trailer', null, null, 2024);
        expect(withYear).not.toBeNull();
        expect(withYear!.tconst).toBe('tt9000002'); // 2024 wins thanks to recency
    });

    test('publishYear does not override an explicit year extracted from title', () => {
        // "(1962)" in the title is an explicit hint and must win over the
        // upload year, even if that upload year contradicts.
        const result = index.match('Beast (1962) - 4K Restoration Trailer', null, null, 2024);
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt9000001');
    });

    test('publishYear keeps "popular old film" choice when no modern alternative exists', () => {
        // Inception has only one row in the fixture (2010). A 2024 upload
        // must still match it — penalty applies but there's no competitor.
        const result = index.match('Inception | Official Trailer', null, null, 2024);
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt1375666');
    });

    // ── #2: drop noise-phrase candidates ────────────────────────────

    test('drops a "Tease" noise candidate and recovers the real show via fuzzy', () => {
        // "The Traitors US | Season 4 Tease | Peacock Original" — the second
        // pipe segment cleans down to "Tease", which would otherwise match an
        // obscure low-vote IMDB row. The noise filter must drop it; fuzzy
        // fallback then truncates "the traitors us" → "the traitors" and hits
        // tt9100001.
        const result = index.match('The Traitors US | Season 4 Tease | Peacock Original');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt9100001');
    });

    test('drops a bracketed [SPOILERS] candidate that would match a 0-vote movie', () => {
        // tt9100002 ("Spoilers", 0 votes) must NEVER be returned because
        // "spoilers" is a known noise phrase.
        const result = index.match('The Traitors | Episode 9 [SPOILERS] | Banished');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt9100001');
    });

    // ── #5: Season/Episode signal hard-filters to TV-family titles ─

    test('without TV signal, "Echo" matches the high-vote 1985 movie', () => {
        const result = index.match('Echo | Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt9100003'); // movie, 100k votes
    });

    test('with "Season N" TV signal, "Echo" matches the tvSeries despite fewer votes', () => {
        const result = index.match('Echo | Season 1 | Official Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt9100004'); // tvSeries, 30k votes
    });

    test('with "S3" TV signal, an only-movie title still matches (graceful fallback)', () => {
        // Inception has no tvSeries row in the fixture. The TV-signal hard
        // filter must NOT silently drop the only available match.
        const result = index.match('Inception S3 | Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt1375666');
    });

    test('with "Episode N" signal, picks tvSeries over equally-titled movie', () => {
        const result = index.match('Echo | Episode 5 | Recap');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt9100004');
    });

    // ── #6: Hashtag confirmation bonus ──────────────────────────────

    test('hashtag confirmation tips score toward the confirmed title', () => {
        // Title contains both "Brooklyn Nine-Nine" (tvSeries, 414k v) and
        // "Inception" (movie, 2.4M v). Without context the high-vote movie
        // wins. A #BrooklynNineNine hashtag in description gives B99 a +3
        // confirmation bonus that flips the result.
        const noTag = index.match('Brooklyn Nine-Nine | Inception | Clip');
        expect(noTag!.tconst).toBe('tt1375666');

        const withTag = index.match(
            'Brooklyn Nine-Nine | Inception | Clip',
            null,
            'Behind the scenes!\n#BrooklynNineNine'
        );
        expect(withTag!.tconst).toBe('tt2467372');
    });

    test('noise hashtags do not produce confirmation bonuses', () => {
        // "#Movies" is in NOISE_HASHTAGS — must not affect scoring.
        const result = index.match(
            'Brooklyn Nine-Nine | Inception | Clip',
            null,
            'New release!\n#Movies #Trailer'
        );
        expect(result!.tconst).toBe('tt1375666');
    });

    // ── #7: 0-vote rows dropped within candidate group ──────────────

    test('drops a 0-vote duplicate when a voted alternative exists in the same group', () => {
        // tt9100005 (1000 v) and tt9100006 (no rating row → 0 v) share the
        // same normalized title "test title". The matcher must return the
        // voted row; tt9100006 must never surface.
        const result = index.match('Test Title | Trailer');
        expect(result).not.toBeNull();
        expect(result!.tconst).toBe('tt9100005');
    });
});

describe('hasTvSeriesSignal', () => {
    test('detects "Season N"', () => {
        expect(hasTvSeriesSignal('BEEF: Season 2 | Official Trailer | Netflix')).toBe(true);
        expect(hasTvSeriesSignal('Cold Opens (Seasons 1 & 2)')).toBe(true);
    });

    test('detects "Episode N"', () => {
        expect(hasTvSeriesSignal('Recap | Episode 9')).toBe(true);
        expect(hasTvSeriesSignal('Ep. 12 | Sneak Peek')).toBe(true);
    });

    test('detects "S3" / "S03E07"', () => {
        expect(hasTvSeriesSignal('Tell Me Lies S3 | Official Trailer')).toBe(true);
        expect(hasTvSeriesSignal('Show S03E07 | Recap')).toBe(true);
    });

    test('does not flag movie titles or numeric sequels', () => {
        expect(hasTvSeriesSignal('Scream 7 | Final Trailer (2026 Movie)')).toBe(false);
        expect(hasTvSeriesSignal('Toy Story 4')).toBe(false);
        expect(hasTvSeriesSignal('Oppenheimer | New Trailer')).toBe(false);
    });
});

describe('isNoiseCandidate', () => {
    test('rejects known noise phrases', () => {
        expect(isNoiseCandidate('the cast')).toBe(true);
        expect(isNoiseCandidate('spoilers')).toBe(true);
        expect(isNoiseCandidate('tease')).toBe(true);
        expect(isNoiseCandidate('recap')).toBe(true);
        expect(isNoiseCandidate('behind the scenes')).toBe(true);
        expect(isNoiseCandidate('sneak peek')).toBe(true);
    });

    test('accepts real titles', () => {
        expect(isNoiseCandidate('the dark knight')).toBe(false);
        expect(isNoiseCandidate('inception')).toBe(false);
        expect(isNoiseCandidate('beast')).toBe(false);
        expect(isNoiseCandidate('up')).toBe(false);
    });
});

describe('isTvFamilyType', () => {
    test('accepts TV-family types', () => {
        for (const t of ['tvSeries', 'tvMiniSeries', 'tvShort', 'tvSpecial', 'tvEpisode']) {
            expect(isTvFamilyType(t)).toBe(true);
        }
    });

    test('rejects movie / short / null', () => {
        expect(isTvFamilyType('movie')).toBe(false);
        expect(isTvFamilyType('short')).toBe(false);
        expect(isTvFamilyType(null)).toBe(false);
        expect(isTvFamilyType(undefined)).toBe(false);
    });
});

describe('extractHashtagSet', () => {
    test('extracts and normalizes PascalCase hashtags', () => {
        const set = extractHashtagSet('Watch now!\n#TellMeLies #BrooklynNineNine');
        expect(set.has('tell me lies')).toBe(true);
        expect(set.has('brooklyn nine nine')).toBe(true);
    });

    test('skips noise hashtags (platforms, generic marketing)', () => {
        const set = extractHashtagSet('#Peacock #Hulu #Movies #Trailer #Comedy');
        expect(set.size).toBe(0);
    });

    test('returns empty set for null/empty', () => {
        expect(extractHashtagSet(null).size).toBe(0);
        expect(extractHashtagSet(undefined).size).toBe(0);
        expect(extractHashtagSet('').size).toBe(0);
        expect(extractHashtagSet('No hashtags here').size).toBe(0);
    });
});

describe('tvAwareYearPenalty', () => {
    test('zero penalty when publishYear is missing', () => {
        expect(tvAwareYearPenalty({ titleType: 'movie', startYear: '2010', endYear: null }, null)).toBe(0);
    });

    test('movie: matches yearDistancePenalty for old films', () => {
        const row = { titleType: 'movie', startYear: '1962', endYear: null };
        expect(tvAwareYearPenalty(row, 2024)).toBeCloseTo(yearDistancePenalty('1962', 2024), 5);
    });

    test('tvSeries with no endYear (ongoing) is never penalized for being old', () => {
        const ongoing = { titleType: 'tvSeries', startYear: '1975', endYear: null };
        expect(tvAwareYearPenalty(ongoing, 2026)).toBe(0);

        const ongoingNStr = { titleType: 'tvSeries', startYear: '1975', endYear: '\\N' };
        expect(tvAwareYearPenalty(ongoingNStr, 2026)).toBe(0);
    });

    test('tvSeries within 5y grace after endYear is not penalized', () => {
        const row = { titleType: 'tvSeries', startYear: '2009', endYear: '2015' };
        // 2026 - 2015 = 11 → > grace of 5
        expect(tvAwareYearPenalty(row, 2018)).toBe(0); // within grace
        expect(tvAwareYearPenalty(row, 2020)).toBe(0); // exactly endYear+5
    });

    test('tvSeries beyond grace gets a small penalty (half the movie rate)', () => {
        const row = { titleType: 'tvSeries', startYear: '2009', endYear: '2015' };
        // 2025 - 2015 - 5 = 5 → 0.05 * 5 = 0.25
        expect(tvAwareYearPenalty(row, 2025)).toBeCloseTo(0.25, 5);
    });

    test('penalizes pre-release uploads for both movies and TV', () => {
        // publishYear=2018, startYear=2024 → diff = -6, penalty = 0.2 * (6 - 4) = 0.4
        const movie = { titleType: 'movie', startYear: '2024', endYear: null };
        expect(tvAwareYearPenalty(movie, 2018)).toBeCloseTo(0.4, 5);

        const tv = { titleType: 'tvSeries', startYear: '2024', endYear: null };
        expect(tvAwareYearPenalty(tv, 2018)).toBeCloseTo(0.4, 5);
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

describe('yearDistancePenalty', () => {
    test('zero penalty when either year is missing', () => {
        expect(yearDistancePenalty(null, 2024)).toBe(0);
        expect(yearDistancePenalty('2024', null)).toBe(0);
        expect(yearDistancePenalty(null, null)).toBe(0);
        expect(yearDistancePenalty(undefined, 2024)).toBe(0);
    });

    test('zero penalty inside the grace window', () => {
        expect(yearDistancePenalty('2024', 2024)).toBe(0);
        expect(yearDistancePenalty('2020', 2024)).toBe(0); // diff = 4
        expect(yearDistancePenalty('2019', 2024)).toBe(0); // diff = 5 (boundary)
        expect(yearDistancePenalty('2026', 2024)).toBe(0); // film a bit newer
    });

    test('penalises films much older than the upload', () => {
        // 1962 film vs 2024 upload: diff = 62, penalty = 0.1 * (62 - 5) = 5.7
        expect(yearDistancePenalty('1962', 2024)).toBeCloseTo(5.7, 5);
        expect(yearDistancePenalty('2000', 2024)).toBeCloseTo(0.1 * (24 - 5), 5);
    });

    test('penalises films far in the future of upload', () => {
        // 2030 film vs 2024 upload: diff = -6, penalty = 0.2 * (6 - 4) = 0.4
        expect(yearDistancePenalty('2030', 2024)).toBeCloseTo(0.4, 5);
    });

    test('returns zero for unparseable startYear', () => {
        expect(yearDistancePenalty('\\N', 2024)).toBe(0);
        expect(yearDistancePenalty('not-a-year', 2024)).toBe(0);
    });
});
