import { describe, test, expect } from 'bun:test';
import path from 'path';
import { parseTitleBasics, parseTitleRatings, type TitleBasics, type TitleRating } from '../../website-tools/imdb-parser';

const FIXTURES_DIR = path.join(import.meta.dir, '..', 'fixtures', 'imdb');

describe('parseTitleBasics', () => {
    test('parses title.basics.tsv.gz and filters by titleType', async () => {
        const titles = await parseTitleBasics(FIXTURES_DIR);

        // Should include movie, tvSeries but NOT tvEpisode or short
        expect(titles.has('tt0111161')).toBe(true); // movie
        expect(titles.has('tt0468569')).toBe(true); // movie
        expect(titles.has('tt15398776')).toBe(true); // movie
        expect(titles.has('tt0944947')).toBe(true); // tvSeries
        expect(titles.has('tt2467372')).toBe(true); // tvSeries
        expect(titles.has('tt9999999')).toBe(false); // tvEpisode - filtered out
        expect(titles.has('tt0000001')).toBe(false); // short - filtered out
    });

    test('correctly parses all fields', async () => {
        const titles = await parseTitleBasics(FIXTURES_DIR);
        const oppenheimer = titles.get('tt15398776') as TitleBasics;

        expect(oppenheimer).toBeDefined();
        expect(oppenheimer.tconst).toBe('tt15398776');
        expect(oppenheimer.titleType).toBe('movie');
        expect(oppenheimer.primaryTitle).toBe('Oppenheimer');
        expect(oppenheimer.originalTitle).toBe('Oppenheimer');
        expect(oppenheimer.startYear).toBe('2023');
        expect(oppenheimer.runtimeMinutes).toBe('180');
        expect(oppenheimer.genres).toBe('Biography,Drama,History');
    });

    test('preserves \\N null markers as literal strings', async () => {
        const titles = await parseTitleBasics(FIXTURES_DIR);
        const shawshank = titles.get('tt0111161') as TitleBasics;

        expect(shawshank.endYear).toBe('\\N');
    });
});

describe('parseTitleRatings', () => {
    test('parses title.ratings.tsv.gz', async () => {
        const ratings = await parseTitleRatings(FIXTURES_DIR);

        expect(ratings.size).toBe(10);
        expect(ratings.has('tt0111161')).toBe(true);
        expect(ratings.has('tt15398776')).toBe(true);
    });

    test('correctly parses rating fields', async () => {
        const ratings = await parseTitleRatings(FIXTURES_DIR);
        const oppenheimer = ratings.get('tt15398776') as TitleRating;

        expect(oppenheimer).toBeDefined();
        expect(oppenheimer.averageRating).toBe('8.3');
        expect(oppenheimer.numVotes).toBe('850000');
    });
});
