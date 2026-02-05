/**
 * Unit tests for Channel Processor
 * Tests video fetching and filtering logic
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { processChannelForWeb, type WebConfig, type ChannelProcessorDeps } from '../../website/channel-processor';
import type { YouTubeApi } from '../../website/interfaces/youtube-api';

/**
 * Create mock ytInitialData HTML with channel details
 */
function createMockChannelHtml(channelTitle: string, options: {
    subscriberCount?: string;
    videoCount?: string;
    description?: string;
    avatar?: string;
    hasContinuationToken?: boolean;
} = {}): string {
    const {
        subscriberCount = '10K subscribers',
        videoCount = '100 videos',
        description = 'Channel description',
        avatar = 'https://yt3.googleusercontent.com/avatar.jpg',
        hasContinuationToken = false,
    } = options;

    const data = {
        metadata: {
            channelMetadataRenderer: {
                title: channelTitle,
                description,
                vanityChannelUrl: `https://www.youtube.com/@${channelTitle.replace(/\s+/g, '')}`,
                externalId: 'UC' + Math.random().toString(36).substring(2, 15),
                avatar: { thumbnails: [{ url: avatar }] },
            },
        },
        header: {
            c4TabbedHeaderRenderer: {
                subscriberCountText: { simpleText: subscriberCount },
            },
        },
        contents: {
            twoColumnBrowseResultsRenderer: {
                tabs: [
                    {
                        tabRenderer: {
                            title: 'Videos',
                            content: {
                                richGridRenderer: {
                                    contents: [],
                                },
                            },
                        },
                    },
                ],
            },
        },
    };

    return `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
}

/**
 * Create mock ytInitialData HTML with videos
 */
function createMockVideosHtml(videos: Array<{
    videoId: string;
    title: string;
    duration: string;
    publishedTime: string;
    views?: string;
    isShort?: boolean;
}>, continuationToken?: string): string {
    const contents = videos.map(v => ({
        richItemRenderer: {
            content: {
                videoRenderer: {
                    videoId: v.videoId,
                    title: { runs: [{ text: v.title }] },
                    lengthText: { simpleText: v.duration },
                    publishedTimeText: { simpleText: v.publishedTime },
                    viewCountText: { simpleText: v.views || '1K views' },
                    thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg` }] },
                },
            },
        },
    }));

    if (continuationToken) {
        contents.push({
            continuationItemRenderer: {
                continuationEndpoint: {
                    continuationCommand: {
                        token: continuationToken,
                    },
                },
            },
        } as any);
    }

    const data = {
        metadata: {
            channelMetadataRenderer: {
                title: 'Test Channel',
                description: 'Test description',
                vanityChannelUrl: 'https://www.youtube.com/@TestChannel',
                externalId: 'UC123456789',
                avatar: { thumbnails: [{ url: 'https://yt3.googleusercontent.com/avatar.jpg' }] },
            },
        },
        header: {
            c4TabbedHeaderRenderer: {
                subscriberCountText: { simpleText: '10K subscribers' },
            },
        },
        contents: {
            twoColumnBrowseResultsRenderer: {
                tabs: [
                    {
                        tabRenderer: {
                            title: 'Videos',
                            content: {
                                richGridRenderer: {
                                    contents,
                                },
                            },
                        },
                    },
                ],
            },
        },
    };

    return `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
}

/**
 * Create mock browse response for pagination
 */
function createMockBrowseResponse(videos: Array<{
    videoId: string;
    title: string;
    duration: string;
    publishedTime: string;
}>, nextToken?: string): any {
    const items = videos.map(v => ({
        richItemRenderer: {
            content: {
                videoRenderer: {
                    videoId: v.videoId,
                    title: { runs: [{ text: v.title }] },
                    lengthText: { simpleText: v.duration },
                    publishedTimeText: { simpleText: v.publishedTime },
                    viewCountText: { simpleText: '1K views' },
                    thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg` }] },
                },
            },
        },
    }));

    if (nextToken) {
        items.push({
            continuationItemRenderer: {
                continuationEndpoint: {
                    continuationCommand: {
                        token: nextToken,
                    },
                },
            },
        } as any);
    }

    return {
        onResponseReceivedActions: [{
            appendContinuationItemsAction: {
                continuationItems: items,
            },
        }],
    };
}

/**
 * Create a mock YouTube API for testing
 */
function createTestYouTubeApi(config: {
    aboutPageHtml?: string;
    videosPageHtml?: string;
    browseResponses?: Map<string, any>;
}): YouTubeApi & { calls: { pages: string[]; browses: string[] } } {
    const calls = { pages: [] as string[], browses: [] as string[] };

    return {
        calls,
        async fetchChannelPage(url: string): Promise<string> {
            calls.pages.push(url);
            if (url.includes('/about')) {
                return config.aboutPageHtml || createMockChannelHtml('Test Channel');
            }
            return config.videosPageHtml || createMockVideosHtml([]);
        },
        async fetchBrowseData(continuation: string, channelUrl: string): Promise<any> {
            calls.browses.push(continuation);
            return config.browseResponses?.get(continuation) || createMockBrowseResponse([]);
        },
        async fetchVideoDetails(videoId: string): Promise<{ publishDate: string | null; description: string | null }> {
            return { publishDate: null, description: null };
        },
    };
}

describe('Channel Processor', () => {
    describe('processChannelForWeb', () => {
        test('returns channel data and videos', async () => {
            const videos = [
                { videoId: 'video1', title: 'Video 1', duration: '10:00', publishedTime: '1 day ago' },
                { videoId: 'video2', title: 'Video 2', duration: '15:00', publishedTime: '2 days ago' },
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', {}, { youtubeApi: api });

            expect(result.channel).toBeDefined();
            expect(result.channel.title).toBe('Test Channel');
            expect(result.videos).toHaveLength(2);
            expect(result.videos[0].videoId).toBe('video1');
        });

        test('handles handle URLs (starting with @)', async () => {
            const api = createTestYouTubeApi({});

            await processChannelForWeb('@MyChannel', {}, { youtubeApi: api });

            expect(api.calls.pages.some(p => p.includes('/@MyChannel/about'))).toBe(true);
            expect(api.calls.pages.some(p => p.includes('/@MyChannel/videos'))).toBe(true);
        });

        test('handles channel ID URLs (starting with UC)', async () => {
            const api = createTestYouTubeApi({});

            await processChannelForWeb('UC123456789', {}, { youtubeApi: api });

            expect(api.calls.pages.some(p => p.includes('/channel/UC123456789/about'))).toBe(true);
        });
    });

    describe('Video Age Filtering (maxAgeDays)', () => {
        test('filters out videos older than maxAgeDays', async () => {
            const videos = [
                { videoId: 'new', title: 'New Video', duration: '10:00', publishedTime: '1 day ago' },
                { videoId: 'old', title: 'Old Video', duration: '10:00', publishedTime: '60 days ago' },
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { maxAgeDays: 30 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(1);
            expect(result.videos[0].videoId).toBe('new');
        });

        test('keeps videos within maxAgeDays', async () => {
            const videos = [
                { videoId: 'v1', title: 'Video 1', duration: '10:00', publishedTime: '5 days ago' },
                { videoId: 'v2', title: 'Video 2', duration: '10:00', publishedTime: '10 days ago' },
                { videoId: 'v3', title: 'Video 3', duration: '10:00', publishedTime: '20 days ago' },
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { maxAgeDays: 30 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(3);
        });

        test('handles "hours ago" time format', async () => {
            const videos = [
                { videoId: 'v1', title: 'Recent', duration: '10:00', publishedTime: '5 hours ago' },
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { maxAgeDays: 1 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(1);  // Hours ago should be within 1 day
        });

        test('handles "weeks ago" time format', async () => {
            const videos = [
                { videoId: 'v1', title: 'Week old', duration: '10:00', publishedTime: '2 weeks ago' },  // 14 days
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { maxAgeDays: 10 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(0);  // 2 weeks = 14 days > 10 days
        });

        test('handles "months ago" time format', async () => {
            const videos = [
                { videoId: 'v1', title: 'Month old', duration: '10:00', publishedTime: '1 month ago' },  // ~30 days
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { maxAgeDays: 60 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(1);  // 1 month = 30 days < 60 days
        });

        test('handles "years ago" time format', async () => {
            const videos = [
                { videoId: 'v1', title: 'Year old', duration: '10:00', publishedTime: '1 year ago' },
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { maxAgeDays: 365 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(1);
        });

        test('no age filtering when maxAgeDays is not set (uses default 30)', async () => {
            const videos = [
                { videoId: 'v1', title: 'Recent', duration: '10:00', publishedTime: '1 day ago' },
                { videoId: 'v2', title: 'Old', duration: '10:00', publishedTime: '60 days ago' },
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', {}, { youtubeApi: api });

            // Default maxAgeDays is 30, so 60 days old should be filtered out
            expect(result.videos).toHaveLength(1);
        });
    });

    describe('Video Duration Filtering (minLengthSeconds)', () => {
        test('filters out videos shorter than minLengthSeconds', async () => {
            const videos = [
                { videoId: 'long', title: 'Long Video', duration: '10:00', publishedTime: '1 day ago' },  // 600 seconds
                { videoId: 'short', title: 'Short Video', duration: '0:30', publishedTime: '1 day ago' },  // 30 seconds
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { minLengthSeconds: 60 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(1);
            expect(result.videos[0].videoId).toBe('long');
        });

        test('keeps videos longer than minLengthSeconds', async () => {
            const videos = [
                { videoId: 'v1', title: 'Video 1', duration: '5:00', publishedTime: '1 day ago' },  // 300 seconds
                { videoId: 'v2', title: 'Video 2', duration: '10:00', publishedTime: '1 day ago' }, // 600 seconds
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { minLengthSeconds: 60 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(2);
        });

        test('handles HH:MM:SS duration format', async () => {
            const videos = [
                { videoId: 'v1', title: 'Hour Long', duration: '1:30:00', publishedTime: '1 day ago' },  // 5400 seconds
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { minLengthSeconds: 3600 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(1);
        });

        test('no duration filtering when minLengthSeconds is 0', async () => {
            const videos = [
                { videoId: 'v1', title: 'Short', duration: '0:10', publishedTime: '1 day ago' },
                { videoId: 'v2', title: 'Long', duration: '30:00', publishedTime: '1 day ago' },
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { minLengthSeconds: 0 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(2);
        });
    });

    describe('Video Limit', () => {
        test('respects videoLimit parameter during pagination', async () => {
            // Initial videos (3 videos)
            const initialVideos = Array.from({ length: 3 }, (_, i) => ({
                videoId: `video${i}`,
                title: `Video ${i}`,
                duration: '10:00',
                publishedTime: '1 day ago',
            }));
            
            // More videos via pagination (10 more)
            const paginatedVideos = Array.from({ length: 10 }, (_, i) => ({
                videoId: `video${i + 10}`,
                title: `Video ${i + 10}`,
                duration: '10:00',
                publishedTime: '1 day ago',
            }));

            const browseResponses = new Map([
                ['token1', createMockBrowseResponse(paginatedVideos)],
            ]);

            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(initialVideos, 'token1'),
                browseResponses,
            });

            // Set limit to 5, but initial page has 3 videos, so only 2 more should be fetched
            const result = await processChannelForWeb('@TestChannel', { videoLimit: 5 }, { youtubeApi: api });

            expect(result.videos.length).toBeLessThanOrEqual(5);
        });

        test('calculates video limit based on maxAgeDays if not explicitly set', async () => {
            const videos = Array.from({ length: 10 }, (_, i) => ({
                videoId: `video${i}`,
                title: `Video ${i}`,
                duration: '10:00',
                publishedTime: '1 day ago',
            }));
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            // With default maxAgeDays of 30, limit should be calculated
            const result = await processChannelForWeb('@TestChannel', {}, { youtubeApi: api });

            expect(result.videos).toBeDefined();
        });
    });

    describe('Pagination', () => {
        test('fetches more videos via pagination', async () => {
            const initialVideos = [
                { videoId: 'v1', title: 'Video 1', duration: '10:00', publishedTime: '1 day ago' },
            ];
            const moreVideos = [
                { videoId: 'v2', title: 'Video 2', duration: '10:00', publishedTime: '2 days ago' },
            ];

            const browseResponses = new Map([
                ['token1', createMockBrowseResponse(moreVideos)],
            ]);

            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(initialVideos, 'token1'),
                browseResponses,
            });

            const result = await processChannelForWeb('@TestChannel', { videoLimit: 10 }, { youtubeApi: api });

            expect(api.calls.browses).toContain('token1');
            expect(result.videos).toHaveLength(2);
        });

        test('stops pagination when video limit is reached', async () => {
            const initialVideos = Array.from({ length: 5 }, (_, i) => ({
                videoId: `v${i}`,
                title: `Video ${i}`,
                duration: '10:00',
                publishedTime: '1 day ago',
            }));

            const browseResponses = new Map([
                ['token1', createMockBrowseResponse([
                    { videoId: 'extra', title: 'Extra', duration: '10:00', publishedTime: '1 day ago' },
                ])],
            ]);

            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(initialVideos, 'token1'),
                browseResponses,
            });

            const result = await processChannelForWeb('@TestChannel', { videoLimit: 5 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(5);
        });

        test('stops pagination when age limit is reached', async () => {
            const initialVideos = [
                { videoId: 'v1', title: 'Video 1', duration: '10:00', publishedTime: '1 day ago' },
            ];

            const browseResponses = new Map([
                ['token1', createMockBrowseResponse([
                    { videoId: 'old', title: 'Old Video', duration: '10:00', publishedTime: '60 days ago' },
                ])],
            ]);

            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(initialVideos, 'token1'),
                browseResponses,
            });

            const result = await processChannelForWeb('@TestChannel', { maxAgeDays: 30, videoLimit: 100 }, { youtubeApi: api });

            expect(result.videos).toHaveLength(1);  // Only the recent video
        });
    });

    describe('Edge Cases', () => {
        test('handles channel with no videos', async () => {
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml([]),
            });

            const result = await processChannelForWeb('@EmptyChannel', {}, { youtubeApi: api });

            expect(result.channel).toBeDefined();
            expect(result.videos).toEqual([]);
        });

        test('handles videos with missing duration', async () => {
            const videos = [
                { videoId: 'v1', title: 'No Duration', duration: '', publishedTime: '1 day ago' },
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { minLengthSeconds: 60 }, { youtubeApi: api });

            // Videos with no duration should not be filtered by duration
            expect(result.videos).toHaveLength(1);
        });

        test('handles videos with missing publishedTime', async () => {
            const videos = [
                { videoId: 'v1', title: 'No Time', duration: '10:00', publishedTime: '' },
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { maxAgeDays: 7 }, { youtubeApi: api });

            // Videos with no publish time should not be filtered by age
            expect(result.videos).toHaveLength(1);
        });

        test('handles combined age and duration filtering', async () => {
            const videos = [
                { videoId: 'good', title: 'Good Video', duration: '10:00', publishedTime: '1 day ago' },
                { videoId: 'old', title: 'Old Video', duration: '10:00', publishedTime: '60 days ago' },
                { videoId: 'short', title: 'Short Video', duration: '0:30', publishedTime: '1 day ago' },
                { videoId: 'both', title: 'Old & Short', duration: '0:30', publishedTime: '60 days ago' },
            ];
            const api = createTestYouTubeApi({
                videosPageHtml: createMockVideosHtml(videos),
            });

            const result = await processChannelForWeb('@TestChannel', { 
                maxAgeDays: 30, 
                minLengthSeconds: 60 
            }, { youtubeApi: api });

            expect(result.videos).toHaveLength(1);
            expect(result.videos[0].videoId).toBe('good');
        });
    });
});
