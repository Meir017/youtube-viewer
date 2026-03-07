import { describe, test, expect, beforeEach } from 'bun:test';
import type { InsightsHandlerDeps, InsightsService } from '../../../website/routes/insights';
import { startInsightsHandler, getInsightsHandler, cancelInsightsHandler } from '../../../website/routes/insights';
import type { VideoInsights, VideoMeta } from '../../../website/copilot-insights';

function createMockInsightsService(): InsightsService & { cache: Map<string, VideoInsights> } {
    const cache = new Map<string, VideoInsights>();
    return {
        cache,
        getVideoInsights(videoId: string) {
            return cache.get(videoId);
        },
        startVideoInsights(videoId: string, meta: VideoMeta) {
            let existing = cache.get(videoId);
            if (existing) return existing;
            const insights: VideoInsights = {
                videoId,
                status: 'researching',
            };
            cache.set(videoId, insights);
            return insights;
        },
        async cancelVideoInsights(videoId: string) {
            const had = cache.has(videoId);
            cache.delete(videoId);
            return had;
        },
    };
}

describe('Insights Routes', () => {
    let deps: InsightsHandlerDeps;
    let mockService: ReturnType<typeof createMockInsightsService>;

    beforeEach(() => {
        mockService = createMockInsightsService();
        deps = { insightsService: mockService };
    });

    describe('POST /api/videos/:videoId/insights', () => {
        test('starts research for a new video', async () => {
            const meta: VideoMeta = {
                title: 'Test Video',
                channelTitle: 'Test Channel',
            };
            const response = await startInsightsHandler(deps, 'abc123', meta);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.videoId).toBe('abc123');
            expect(data.status).toBe('researching');
        });

        test('returns existing insights if already cached', async () => {
            mockService.cache.set('abc123', {
                videoId: 'abc123',
                status: 'complete',
                content: '# Test Content',
                generatedAt: '2025-01-01T00:00:00.000Z',
            });

            const meta: VideoMeta = { title: 'Test Video' };
            const response = await startInsightsHandler(deps, 'abc123', meta);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('complete');
            expect(data.content).toBe('# Test Content');
        });
    });

    describe('GET /api/videos/:videoId/insights', () => {
        test('returns not_started for unknown video', async () => {
            const response = await getInsightsHandler(deps, 'unknown');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('not_started');
        });

        test('returns current status for researching video', async () => {
            mockService.cache.set('abc123', {
                videoId: 'abc123',
                status: 'researching',
            });

            const response = await getInsightsHandler(deps, 'abc123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('researching');
        });

        test('returns completed insights with content', async () => {
            mockService.cache.set('abc123', {
                videoId: 'abc123',
                status: 'complete',
                content: '## Movie Info\n\nGreat movie!',
                generatedAt: '2025-01-01T00:00:00.000Z',
            });

            const response = await getInsightsHandler(deps, 'abc123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('complete');
            expect(data.content).toContain('Movie Info');
            expect(data.generatedAt).toBeDefined();
        });

        test('returns error status', async () => {
            mockService.cache.set('abc123', {
                videoId: 'abc123',
                status: 'error',
                error: 'Research failed',
            });

            const response = await getInsightsHandler(deps, 'abc123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('error');
            expect(data.error).toBe('Research failed');
        });
    });

    describe('DELETE /api/videos/:videoId/insights', () => {
        test('cancels an in-progress research', async () => {
            mockService.cache.set('abc123', {
                videoId: 'abc123',
                status: 'researching',
            });

            const response = await cancelInsightsHandler(deps, 'abc123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.cancelled).toBe(true);
            expect(mockService.cache.has('abc123')).toBe(false);
        });

        test('returns cancelled false for unknown video', async () => {
            const response = await cancelInsightsHandler(deps, 'unknown');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.cancelled).toBe(false);
        });
    });
});
