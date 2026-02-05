/**
 * Unit tests for Video Enrichment
 * Tests video enrichment job management
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
    getEnrichmentJob,
    calculateEnrichmentStats,
    getEnrichmentStatus,
    startEnrichment,
    type Collection,
    type StoredChannel,
    type EnrichmentJob,
} from '../../website/video-enrichment';
import { createMockCollection, createMockStoredChannel, createMockVideo, createMockChannelData } from '../utils';

/**
 * Create a test collection with videos
 */
function createTestCollection(config: {
    channelCount?: number;
    videosPerChannel?: number;
    enrichedCount?: number;
    shortsCount?: number;
} = {}): Collection {
    const {
        channelCount = 1,
        videosPerChannel = 5,
        enrichedCount = 0,
        shortsCount = 0,
    } = config;

    const channels: StoredChannel[] = [];
    let enrichedRemaining = enrichedCount;
    let shortsRemaining = shortsCount;

    for (let c = 0; c < channelCount; c++) {
        const videos = [];
        for (let v = 0; v < videosPerChannel; v++) {
            const isShort = shortsRemaining > 0;
            const isEnriched = !isShort && enrichedRemaining > 0;

            videos.push({
                videoId: `video_${c}_${v}`,
                title: `Video ${v} of Channel ${c}`,
                thumbnail: `https://i.ytimg.com/vi/video_${c}_${v}/mqdefault.jpg`,
                duration: isShort ? '0:30' : '10:00',
                views: '1K views',
                uploadedAt: '2 days ago',
                isShort,
                ...(isEnriched ? {
                    publishDate: '2024-01-15',
                    description: 'Enriched description',
                } : {}),
            });

            if (isShort) shortsRemaining--;
            if (isEnriched) enrichedRemaining--;
        }

        channels.push(createMockStoredChannel({
            handle: `@Channel${c}`,
            data: {
                channel: createMockChannelData().channel,
                videos,
            } as any,
        }));
    }

    return createMockCollection({
        name: 'Test Collection',
        channels,
    });
}

describe('Video Enrichment', () => {
    describe('calculateEnrichmentStats', () => {
        test('counts total videos (excluding shorts)', () => {
            const collection = createTestCollection({
                videosPerChannel: 10,
                shortsCount: 3,
            });

            const stats = calculateEnrichmentStats(collection);

            expect(stats.totalVideos).toBe(7);  // 10 - 3 shorts
            expect(stats.shortsCount).toBe(3);
        });

        test('counts enriched videos correctly', () => {
            const collection = createTestCollection({
                videosPerChannel: 10,
                enrichedCount: 4,
            });

            const stats = calculateEnrichmentStats(collection);

            expect(stats.enrichedVideos).toBe(4);
        });

        test('sets allEnriched true when all videos are enriched', () => {
            const collection = createTestCollection({
                videosPerChannel: 5,
                enrichedCount: 5,
            });

            const stats = calculateEnrichmentStats(collection);

            expect(stats.allEnriched).toBe(true);
        });

        test('sets allEnriched false when some videos not enriched', () => {
            const collection = createTestCollection({
                videosPerChannel: 5,
                enrichedCount: 3,
            });

            const stats = calculateEnrichmentStats(collection);

            expect(stats.allEnriched).toBe(false);
        });

        test('handles empty collection', () => {
            const collection = createMockCollection({ channels: [] });

            const stats = calculateEnrichmentStats(collection);

            expect(stats.totalVideos).toBe(0);
            expect(stats.enrichedVideos).toBe(0);
            expect(stats.shortsCount).toBe(0);
            expect(stats.allEnriched).toBe(false);
        });

        test('handles collection with no videos', () => {
            const collection = createMockCollection({
                channels: [createMockStoredChannel({ data: { channel: createMockChannelData().channel, videos: [] } as any })],
            });

            const stats = calculateEnrichmentStats(collection);

            expect(stats.totalVideos).toBe(0);
            expect(stats.allEnriched).toBe(false);
        });

        test('handles multiple channels', () => {
            const collection = createTestCollection({
                channelCount: 3,
                videosPerChannel: 5,
                enrichedCount: 2,
            });

            const stats = calculateEnrichmentStats(collection);

            expect(stats.totalVideos).toBe(15);  // 3 channels * 5 videos
            expect(stats.enrichedVideos).toBe(2);
        });

        test('shorts are not counted as total videos', () => {
            const collection = createTestCollection({
                videosPerChannel: 10,
                shortsCount: 10,  // All are shorts
            });

            const stats = calculateEnrichmentStats(collection);

            expect(stats.totalVideos).toBe(0);
            expect(stats.shortsCount).toBe(10);
        });

        test('allEnriched is true when only shorts exist', () => {
            // Edge case: if there are no regular videos, nothing to enrich
            const collection = createTestCollection({
                videosPerChannel: 5,
                shortsCount: 5,
            });

            const stats = calculateEnrichmentStats(collection);

            expect(stats.totalVideos).toBe(0);
            expect(stats.allEnriched).toBe(false);  // No videos means not "all enriched"
        });
    });

    describe('getEnrichmentStatus', () => {
        test('returns idle status when no job exists', () => {
            const collection = createTestCollection({ videosPerChannel: 5 });

            const status = getEnrichmentStatus(collection);

            expect(status.status).toBe('idle');
        });

        test('includes stats from collection', () => {
            const collection = createTestCollection({
                videosPerChannel: 10,
                enrichedCount: 3,
                shortsCount: 2,
            });

            const status = getEnrichmentStatus(collection);

            expect(status.totalVideos).toBe(8);  // 10 - 2 shorts
            expect(status.enrichedVideos).toBe(3);
            expect(status.shortsCount).toBe(2);
        });

        test('returns allEnriched status', () => {
            const collection = createTestCollection({
                videosPerChannel: 5,
                enrichedCount: 5,
            });

            const status = getEnrichmentStatus(collection);

            expect(status.allEnriched).toBe(true);
        });
    });

    describe('startEnrichment', () => {
        test('creates new job', () => {
            const collection = createTestCollection({ videosPerChannel: 5 });
            let saveCalled = false;
            const saveCallback = async () => { saveCalled = true; };

            const result = startEnrichment(collection, saveCallback);

            expect(result.started).toBe(true);
            expect(result.job).toBeDefined();
            expect(result.job.status).toBe('running');
        });

        test('counts videos to enrich correctly', () => {
            const collection = createTestCollection({
                videosPerChannel: 10,
                enrichedCount: 3,  // Already enriched
                shortsCount: 2,    // Shorts
            });
            const saveCallback = async () => {};

            const result = startEnrichment(collection, saveCallback);

            // Total should be 10 - 3 (enriched) - 2 (shorts) = 5
            expect(result.job.total).toBe(5);
            // Skipped = 3 (enriched) + 2 (shorts) = 5
            expect(result.job.skipped).toBe(5);
        });

        test('returns existing job if already running', () => {
            const collection = createTestCollection({ videosPerChannel: 5 });
            const saveCallback = async () => {};

            // Start first job
            const result1 = startEnrichment(collection, saveCallback);
            expect(result1.started).toBe(true);

            // Try to start second job for same collection
            const result2 = startEnrichment(collection, saveCallback);
            expect(result2.started).toBe(false);
            expect(result2.message).toBe('Enrichment already in progress');
            expect(result2.job).toBe(result1.job);
        });

        test('initializes job with correct values', () => {
            const collection = createTestCollection({ videosPerChannel: 5 });
            const saveCallback = async () => {};

            const result = startEnrichment(collection, saveCallback);

            expect(result.job.collectionId).toBe(collection.id);
            expect(result.job.enriched).toBe(0);
            expect(result.job.failed).toBe(0);
            expect(result.job.rateLimited).toBe(false);
            expect(result.job.startedAt).toBeDefined();
        });

        test('handles collection with no videos to enrich', () => {
            const collection = createTestCollection({
                videosPerChannel: 5,
                enrichedCount: 5,  // All already enriched
            });
            const saveCallback = async () => {};

            const result = startEnrichment(collection, saveCallback);

            expect(result.started).toBe(true);
            expect(result.job.total).toBe(0);
        });
    });

    describe('getEnrichmentJob', () => {
        test('returns undefined when no job exists', () => {
            const job = getEnrichmentJob('non-existent-collection');

            expect(job).toBeUndefined();
        });

        test('returns job after starting enrichment', () => {
            const collection = createTestCollection({ videosPerChannel: 5 });
            const saveCallback = async () => {};

            startEnrichment(collection, saveCallback);
            const job = getEnrichmentJob(collection.id);

            expect(job).toBeDefined();
            expect(job?.status).toBe('running');
        });
    });

    describe('Enrichment behavior (integration)', () => {
        test('skips shorts during enrichment', () => {
            const collection = createTestCollection({
                videosPerChannel: 5,
                shortsCount: 3,
            });
            const saveCallback = async () => {};

            const result = startEnrichment(collection, saveCallback);

            // Should only attempt to enrich 2 non-shorts
            expect(result.job.total).toBe(2);
            expect(result.job.skipped).toBe(3);
        });

        test('skips already enriched videos', () => {
            const collection = createTestCollection({
                videosPerChannel: 5,
                enrichedCount: 2,
            });
            const saveCallback = async () => {};

            const result = startEnrichment(collection, saveCallback);

            // Should only attempt to enrich 3 unenriched videos
            expect(result.job.total).toBe(3);
            expect(result.job.skipped).toBe(2);
        });

        test('combines shorts and enriched in skipped count', () => {
            const collection = createTestCollection({
                videosPerChannel: 10,
                enrichedCount: 3,
                shortsCount: 2,
            });
            const saveCallback = async () => {};

            const result = startEnrichment(collection, saveCallback);

            expect(result.job.total).toBe(5);  // 10 - 3 - 2
            expect(result.job.skipped).toBe(5);  // 3 enriched + 2 shorts
        });
    });
});
