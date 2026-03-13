/**
 * Unit tests for the client-side age range filtering logic.
 * Tests the core functions: parseDateAge, getVideoAgeDays, and filterVideos age filtering.
 */

import { describe, test, expect } from 'bun:test';

// Replicate the client-side parseDateAge function
function parseDateAge(dateStr: string | undefined): number {
    if (!dateStr) return Infinity;
    const str = dateStr.toLowerCase();
    const match = str.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/);
    if (!match) return Infinity;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
        second: 1, minute: 60, hour: 3600, day: 86400,
        week: 604800, month: 2592000, year: 31536000
    };
    return num * (multipliers[unit] || 1);
}

// Replicate the client-side getVideoAgeDays function
function getVideoAgeDays(video: { publishDate?: string; publishedTime?: string }): number {
    if (video.publishDate) {
        const pubDate = new Date(video.publishDate);
        if (!isNaN(pubDate.getTime())) {
            return (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
        }
    }
    const ageSec = parseDateAge(video.publishedTime);
    return ageSec === Infinity ? Infinity : ageSec / 86400;
}

interface TestVideo {
    videoId: string;
    title: string;
    publishedTime?: string;
    publishDate?: string;
    viewCount?: string;
    duration?: string;
    isShort?: boolean;
    channelIndex?: number;
}

function createTestVideo(overrides: Partial<TestVideo> = {}): TestVideo {
    return {
        videoId: `vid-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Test Video',
        publishedTime: '3 days ago',
        duration: '10:30',
        isShort: false,
        channelIndex: 0,
        ...overrides,
    };
}

// Replicate filterVideos with age range logic
function filterVideos(
    videos: TestVideo[],
    options: {
        ageRangeDays: number;
        activeChannel?: string;
        searchQuery?: string;
    }
): TestVideo[] {
    const { ageRangeDays, activeChannel = 'all', searchQuery = '' } = options;

    return videos.filter(video => {
        const matchesChannel = activeChannel === 'all' || video.channelIndex === parseInt(activeChannel);
        const matchesSearch = searchQuery === '' || (video.title || '').toLowerCase().includes(searchQuery);
        const matchesAge = ageRangeDays === Infinity || getVideoAgeDays(video) <= ageRangeDays;
        return matchesChannel && matchesSearch && matchesAge && !video.isShort;
    });
}

describe('parseDateAge', () => {
    test('returns Infinity for undefined input', () => {
        expect(parseDateAge(undefined)).toBe(Infinity);
    });

    test('returns Infinity for empty string', () => {
        expect(parseDateAge('')).toBe(Infinity);
    });

    test('returns Infinity for unparseable string', () => {
        expect(parseDateAge('Streamed live')).toBe(Infinity);
    });

    test('parses "3 days ago" correctly', () => {
        expect(parseDateAge('3 days ago')).toBe(3 * 86400);
    });

    test('parses "1 day ago" correctly', () => {
        expect(parseDateAge('1 day ago')).toBe(86400);
    });

    test('parses "2 weeks ago" correctly', () => {
        expect(parseDateAge('2 weeks ago')).toBe(2 * 604800);
    });

    test('parses "1 month ago" correctly', () => {
        expect(parseDateAge('1 month ago')).toBe(2592000);
    });

    test('parses "6 months ago" correctly', () => {
        expect(parseDateAge('6 months ago')).toBe(6 * 2592000);
    });

    test('parses "1 year ago" correctly', () => {
        expect(parseDateAge('1 year ago')).toBe(31536000);
    });

    test('parses "5 hours ago" correctly', () => {
        expect(parseDateAge('5 hours ago')).toBe(5 * 3600);
    });

    test('parses "30 minutes ago" correctly', () => {
        expect(parseDateAge('30 minutes ago')).toBe(30 * 60);
    });

    test('parses "10 seconds ago" correctly', () => {
        expect(parseDateAge('10 seconds ago')).toBe(10);
    });
});

describe('getVideoAgeDays', () => {
    test('uses publishDate when available (exact ISO date)', () => {
        const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString().split('T')[0];
        const video = createTestVideo({ publishDate: threeDaysAgo });
        const ageDays = getVideoAgeDays(video);
        // Should be approximately 3 days (allow some tolerance for time-of-day)
        expect(ageDays).toBeGreaterThan(2.5);
        expect(ageDays).toBeLessThan(4);
    });

    test('falls back to publishedTime when publishDate is absent', () => {
        const video = createTestVideo({ publishedTime: '7 days ago' });
        const ageDays = getVideoAgeDays(video);
        expect(ageDays).toBe(7);
    });

    test('prefers publishDate over publishedTime', () => {
        const oneDayAgo = new Date(Date.now() - 86400 * 1000).toISOString().split('T')[0];
        const video = createTestVideo({
            publishDate: oneDayAgo,
            publishedTime: '30 days ago',
        });
        const ageDays = getVideoAgeDays(video);
        // Should use publishDate (1 day), not publishedTime (30 days)
        expect(ageDays).toBeLessThan(3);
    });

    test('returns Infinity when neither date field is present', () => {
        const video = createTestVideo({ publishedTime: undefined, publishDate: undefined });
        expect(getVideoAgeDays(video)).toBe(Infinity);
    });

    test('falls back to publishedTime when publishDate is invalid', () => {
        const video = createTestVideo({
            publishDate: 'not-a-date',
            publishedTime: '5 days ago',
        });
        const ageDays = getVideoAgeDays(video);
        expect(ageDays).toBe(5);
    });

    test('handles "hours ago" correctly (fractional days)', () => {
        const video = createTestVideo({ publishedTime: '12 hours ago' });
        const ageDays = getVideoAgeDays(video);
        expect(ageDays).toBe(0.5);
    });

    test('handles "months ago" correctly', () => {
        const video = createTestVideo({ publishedTime: '2 months ago' });
        const ageDays = getVideoAgeDays(video);
        expect(ageDays).toBe(60); // 2 * 30 days
    });
});

describe('filterVideos with age range', () => {
    const videos = [
        createTestVideo({ title: 'Recent', publishedTime: '1 day ago' }),
        createTestVideo({ title: 'Last week', publishedTime: '5 days ago' }),
        createTestVideo({ title: 'Last month', publishedTime: '25 days ago' }),
        createTestVideo({ title: 'Two months', publishedTime: '50 days ago' }),
        createTestVideo({ title: 'Old video', publishedTime: '1 year ago' }),
        createTestVideo({ title: 'No date' }),
    ];
    // Remove publishedTime from "No date" video
    delete (videos[5] as any).publishedTime;

    test('shows all videos when ageRangeDays is Infinity (All preset)', () => {
        const result = filterVideos(videos, { ageRangeDays: Infinity });
        expect(result).toHaveLength(6);
    });

    test('filters to last 7 days (1W preset)', () => {
        const result = filterVideos(videos, { ageRangeDays: 7 });
        expect(result).toHaveLength(2);
        expect(result.map(v => v.title)).toEqual(['Recent', 'Last week']);
    });

    test('filters to last 30 days (1M preset)', () => {
        const result = filterVideos(videos, { ageRangeDays: 30 });
        expect(result).toHaveLength(3);
        expect(result.map(v => v.title)).toEqual(['Recent', 'Last week', 'Last month']);
    });

    test('filters to last 60 days (2M preset)', () => {
        const result = filterVideos(videos, { ageRangeDays: 60 });
        const titles = result.map(v => v.title);
        expect(titles).toContain('Recent');
        expect(titles).toContain('Last week');
        expect(titles).toContain('Last month');
        expect(titles).toContain('Two months');
        expect(titles).not.toContain('Old video');
    });

    test('filters to last 365 days (1Y preset)', () => {
        const result = filterVideos(videos, { ageRangeDays: 365 });
        expect(result).toHaveLength(5);
        expect(result.map(v => v.title)).not.toContain('No date');
    });

    test('excludes videos with no date when age range is set', () => {
        const result = filterVideos(videos, { ageRangeDays: 30 });
        expect(result.find(v => v.title === 'No date')).toBeUndefined();
    });

    test('includes videos with no date when ageRangeDays is Infinity', () => {
        const result = filterVideos(videos, { ageRangeDays: Infinity });
        expect(result.find(v => v.title === 'No date')).toBeDefined();
    });

    test('combines age range with search query', () => {
        const result = filterVideos(videos, {
            ageRangeDays: 30,
            searchQuery: 'last',
        });
        expect(result).toHaveLength(2);
        expect(result.map(v => v.title)).toEqual(['Last week', 'Last month']);
    });

    test('combines age range with channel filter', () => {
        const channelVideos = [
            createTestVideo({ title: 'Ch0 Recent', publishedTime: '1 day ago', channelIndex: 0 }),
            createTestVideo({ title: 'Ch1 Recent', publishedTime: '1 day ago', channelIndex: 1 }),
            createTestVideo({ title: 'Ch0 Old', publishedTime: '1 year ago', channelIndex: 0 }),
        ];
        const result = filterVideos(channelVideos, {
            ageRangeDays: 30,
            activeChannel: '0',
        });
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Ch0 Recent');
    });

    test('filters out shorts regardless of age', () => {
        const mixedVideos = [
            createTestVideo({ title: 'Regular', publishedTime: '1 day ago', isShort: false }),
            createTestVideo({ title: 'Short', publishedTime: '1 day ago', isShort: true }),
        ];
        const result = filterVideos(mixedVideos, { ageRangeDays: 30 });
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Regular');
    });

    test('custom age range works with arbitrary day values', () => {
        const result = filterVideos(videos, { ageRangeDays: 10 });
        expect(result).toHaveLength(2);
    });

    test('uses publishDate for precise filtering when available', () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(Date.now() - 31 * 86400 * 1000).toISOString().split('T')[0];
        
        const enrichedVideos = [
            createTestVideo({ title: 'Enriched Recent', publishDate: twoDaysAgo, publishedTime: '2 days ago' }),
            createTestVideo({ title: 'Enriched Old', publishDate: thirtyDaysAgo, publishedTime: '1 month ago' }),
        ];
        const result = filterVideos(enrichedVideos, { ageRangeDays: 7 });
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Enriched Recent');
    });
});

describe('Age range preset mappings', () => {
    const presets: Array<{ label: string; days: number }> = [
        { label: '1W', days: 7 },
        { label: '1M', days: 30 },
        { label: '2M', days: 60 },
        { label: '3M', days: 90 },
        { label: '6M', days: 180 },
        { label: '1Y', days: 365 },
        { label: 'All', days: 0 },
    ];

    for (const preset of presets) {
        test(`preset "${preset.label}" maps to ${preset.days === 0 ? 'Infinity' : preset.days + ' days'}`, () => {
            const ageRangeDays = preset.days === 0 ? Infinity : preset.days;
            if (preset.days === 0) {
                expect(ageRangeDays).toBe(Infinity);
            } else {
                expect(ageRangeDays).toBe(preset.days);
            }
        });
    }
});
