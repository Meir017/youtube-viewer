import { describe, test, expect } from 'bun:test';
import { derivePublishYear } from '../../website-tools/enrich-imdb';

describe('derivePublishYear', () => {
    const fixed = new Date('2026-05-12T00:00:00Z');

    test('parses absolute publishDate when present', () => {
        expect(derivePublishYear({ publishDate: 'Feb 2, 2026' }, fixed)).toBe(2026);
        expect(derivePublishYear({ publishDate: 'Dec 31, 1999' }, fixed)).toBe(1999);
    });

    test('prefers publishDate over publishedTime', () => {
        expect(
            derivePublishYear(
                { publishDate: 'Jan 1, 2020', publishedTime: '3 years ago' },
                fixed,
            ),
        ).toBe(2020);
    });

    test('parses "N years ago" relative to now', () => {
        expect(derivePublishYear({ publishedTime: '5 years ago' }, fixed)).toBe(2021);
        expect(derivePublishYear({ publishedTime: '1 year ago' }, fixed)).toBe(2025);
    });

    test('months/weeks/days are treated as current year', () => {
        expect(derivePublishYear({ publishedTime: '3 months ago' }, fixed)).toBe(2026);
        expect(derivePublishYear({ publishedTime: '2 weeks ago' }, fixed)).toBe(2026);
        expect(derivePublishYear({ publishedTime: '5 days ago' }, fixed)).toBe(2026);
        expect(derivePublishYear({ publishedTime: '1 hour ago' }, fixed)).toBe(2026);
    });

    test('returns null when nothing parseable is provided', () => {
        expect(derivePublishYear({}, fixed)).toBeNull();
        expect(derivePublishYear({ publishedTime: 'Premieres tomorrow' }, fixed)).toBeNull();
        expect(derivePublishYear({ publishDate: 'unknown' }, fixed)).toBeNull();
    });

    test('ignores garbage in publishDate but still picks a 4-digit year', () => {
        // YouTube has been seen to use formats like "Premiered Jul 1, 2024"
        expect(derivePublishYear({ publishDate: 'Premiered Jul 1, 2024' }, fixed)).toBe(2024);
    });
});
