/**
 * Unit tests for Image Cache
 * Tests image caching proxy functionality
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { join } from 'path';
import {
    getCachedImage,
    getCachedAvatar,
    getCacheStats,
    clearCache,
    sanitizeHandle,
    type ImageCacheDeps,
} from '../../website/image-cache';
import { createMockImageFetcher, createMockImageCacheStorage } from '../mocks';

// Use a cross-platform test cache directory
const TEST_CACHE_DIR = join('test', 'cache');

describe('Image Cache', () => {
    let deps: ImageCacheDeps;
    let mockFetcher: ReturnType<typeof createMockImageFetcher>;
    let mockStorage: ReturnType<typeof createMockImageCacheStorage>;

    beforeEach(() => {
        mockFetcher = createMockImageFetcher();
        mockStorage = createMockImageCacheStorage();
        deps = {
            fetcher: mockFetcher,
            storage: mockStorage,
            cacheDir: TEST_CACHE_DIR,
        };
    });

    describe('sanitizeHandle', () => {
        test('removes @ prefix from handle', () => {
            expect(sanitizeHandle('@TestChannel')).toBe('TestChannel');
        });

        test('keeps handle without @ prefix', () => {
            expect(sanitizeHandle('TestChannel')).toBe('TestChannel');
        });

        test('replaces special characters with underscore', () => {
            expect(sanitizeHandle('@Test.Channel!')).toBe('Test_Channel_');
        });

        test('keeps alphanumeric, underscore, and hyphen', () => {
            expect(sanitizeHandle('@Test_Channel-123')).toBe('Test_Channel-123');
        });

        test('handles empty string', () => {
            expect(sanitizeHandle('')).toBe('');
        });

        test('handles only @ symbol', () => {
            expect(sanitizeHandle('@')).toBe('');
        });
    });

    describe('getCachedImage', () => {
        test('returns cached file when available', async () => {
            // Pre-populate cache using the correct path format
            const cachePath = join(TEST_CACHE_DIR, 'TestChannel_video123_mqdefault.jpg');
            const cachedBlob = new Blob(['cached image data'], { type: 'image/jpeg' });
            mockStorage.files.set(cachePath, cachedBlob);

            const result = await getCachedImage('@TestChannel', 'video123', 'mqdefault', deps);

            expect(result.fromCache).toBe(true);
            expect(result.file).not.toBeNull();
            expect(result.error).toBeUndefined();
            expect(mockFetcher.calls).toHaveLength(0);  // No fetch made
        });

        test('fetches and caches new image when not in cache', async () => {
            const result = await getCachedImage('@TestChannel', 'video456', 'hqdefault', deps);

            expect(result.fromCache).toBe(false);
            expect(result.file).not.toBeNull();
            expect(mockFetcher.calls).toHaveLength(1);
            expect(mockFetcher.calls[0]).toContain('video456');
        });

        test('writes fetched image to cache', async () => {
            await getCachedImage('@TestChannel', 'video789', 'mqdefault', deps);

            // Wait a bit for async cache write
            await new Promise(resolve => setTimeout(resolve, 50));

            const expectedPath = join(TEST_CACHE_DIR, 'TestChannel_video789_mqdefault.jpg');
            expect(mockStorage.files.has(expectedPath)).toBe(true);
        });

        test('handles fetch errors gracefully', async () => {
            const failingFetcher = createMockImageFetcher({
                failUrls: new Set(['https://i.ytimg.com/vi/failing/mqdefault.jpg']),
            });
            deps.fetcher = failingFetcher;

            const result = await getCachedImage('@TestChannel', 'failing', 'mqdefault', deps);

            expect(result.file).toBeNull();
            expect(result.error).toBeDefined();
            expect(result.fromCache).toBe(false);
        });

        test('returns error for unknown thumbnail type', async () => {
            const result = await getCachedImage('@TestChannel', 'video123', 'unknowntype', deps);

            expect(result.file).toBeNull();
            expect(result.error).toContain('Unknown thumbnail type');
        });

        test('supports mqdefault thumbnail type', async () => {
            const result = await getCachedImage('@TestChannel', 'video123', 'mqdefault', deps);

            expect(result.error).toBeUndefined();
            expect(mockFetcher.calls[0]).toContain('/mqdefault.jpg');
        });

        test('supports hqdefault thumbnail type', async () => {
            const result = await getCachedImage('@TestChannel', 'video123', 'hqdefault', deps);

            expect(result.error).toBeUndefined();
            expect(mockFetcher.calls[0]).toContain('/hqdefault.jpg');
        });

        test('supports sddefault thumbnail type', async () => {
            const result = await getCachedImage('@TestChannel', 'video123', 'sddefault', deps);

            expect(result.error).toBeUndefined();
            expect(mockFetcher.calls[0]).toContain('/sddefault.jpg');
        });

        test('supports maxresdefault thumbnail type', async () => {
            const result = await getCachedImage('@TestChannel', 'video123', 'maxresdefault', deps);

            expect(result.error).toBeUndefined();
            expect(mockFetcher.calls[0]).toContain('/maxresdefault.jpg');
        });

        test('supports oar2 thumbnail type (for Shorts)', async () => {
            const result = await getCachedImage('@TestChannel', 'short123', 'oar2', deps);

            expect(result.error).toBeUndefined();
            expect(mockFetcher.calls[0]).toContain('/oar2.jpg');
        });

        test('sanitizes channel handle in cache path', async () => {
            await getCachedImage('@Test.Channel!', 'video123', 'mqdefault', deps);

            // Wait for async write
            await new Promise(resolve => setTimeout(resolve, 10));

            // Should use sanitized handle (Test_Channel_) not the original
            const cachedPaths = Array.from(mockStorage.files.keys());
            expect(cachedPaths.some(p => p.includes('Test_Channel_'))).toBe(true);
        });

        test('returns correct content type from fetch', async () => {
            const webpFetcher = createMockImageFetcher({
                defaultImage: { data: new Blob(['webp data']), contentType: 'image/webp' },
            });
            deps.fetcher = webpFetcher;

            const result = await getCachedImage('@TestChannel', 'video123', 'mqdefault', deps);

            expect(result.contentType).toBe('image/webp');
        });
    });

    describe('getCachedAvatar', () => {
        test('returns cached avatar when available', async () => {
            const cachePath = join(TEST_CACHE_DIR, 'TestChannel_avatar.jpg');
            const cachedBlob = new Blob(['avatar data'], { type: 'image/jpeg' });
            mockStorage.files.set(cachePath, cachedBlob);

            const result = await getCachedAvatar(
                '@TestChannel',
                'https://yt3.googleusercontent.com/avatar.jpg',
                deps
            );

            expect(result.fromCache).toBe(true);
            expect(mockFetcher.calls).toHaveLength(0);
        });

        test('fetches and caches new avatar', async () => {
            const result = await getCachedAvatar(
                '@TestChannel',
                'https://yt3.googleusercontent.com/avatar.jpg',
                deps
            );

            expect(result.fromCache).toBe(false);
            expect(result.file).not.toBeNull();
            expect(mockFetcher.calls).toHaveLength(1);
        });

        test('validates YouTube domain - googleusercontent', async () => {
            const result = await getCachedAvatar(
                '@TestChannel',
                'https://yt3.googleusercontent.com/avatar.jpg',
                deps
            );

            expect(result.error).toBeUndefined();
        });

        test('validates YouTube domain - ggpht', async () => {
            const result = await getCachedAvatar(
                '@TestChannel',
                'https://yt3.ggpht.com/avatar.jpg',
                deps
            );

            expect(result.error).toBeUndefined();
        });

        test('rejects invalid avatar URL', async () => {
            const result = await getCachedAvatar(
                '@TestChannel',
                'https://malicious-site.com/fake-avatar.jpg',
                deps
            );

            expect(result.file).toBeNull();
            expect(result.error).toBe('Invalid avatar URL');
            expect(mockFetcher.calls).toHaveLength(0);
        });

        test('handles fetch errors gracefully', async () => {
            const failingFetcher = createMockImageFetcher({
                failUrls: new Set(['https://yt3.googleusercontent.com/failing.jpg']),
            });
            deps.fetcher = failingFetcher;

            const result = await getCachedAvatar(
                '@TestChannel',
                'https://yt3.googleusercontent.com/failing.jpg',
                deps
            );

            expect(result.file).toBeNull();
            expect(result.error).toBeDefined();
        });
    });

    describe('getCacheStats', () => {
        test('returns zero counts for empty cache', async () => {
            const stats = await getCacheStats(deps);

            expect(stats.fileCount).toBe(0);
            expect(stats.totalSize).toBe(0);
        });

        test('returns correct file count', async () => {
            mockStorage.files.set(join(TEST_CACHE_DIR, 'image1.jpg'), new Blob(['data1']));
            mockStorage.files.set(join(TEST_CACHE_DIR, 'image2.jpg'), new Blob(['data2']));
            mockStorage.files.set(join(TEST_CACHE_DIR, 'image3.jpg'), new Blob(['data3']));

            const stats = await getCacheStats(deps);

            expect(stats.fileCount).toBe(3);
        });

        test('returns correct total size', async () => {
            const data1 = 'x'.repeat(100);
            const data2 = 'y'.repeat(200);
            mockStorage.files.set(join(TEST_CACHE_DIR, 'image1.jpg'), new Blob([data1]));
            mockStorage.files.set(join(TEST_CACHE_DIR, 'image2.jpg'), new Blob([data2]));

            const stats = await getCacheStats(deps);

            expect(stats.totalSize).toBe(300);
        });
    });

    describe('clearCache', () => {
        test('removes all cached images', async () => {
            mockStorage.files.set(join(TEST_CACHE_DIR, 'image1.jpg'), new Blob(['data1']));
            mockStorage.files.set(join(TEST_CACHE_DIR, 'image2.jpg'), new Blob(['data2']));

            const count = await clearCache(deps);

            expect(count).toBe(2);
        });

        test('returns zero when cache is empty', async () => {
            const count = await clearCache(deps);

            expect(count).toBe(0);
        });

        test('only removes jpg files', async () => {
            mockStorage.files.set(join(TEST_CACHE_DIR, 'image1.jpg'), new Blob(['data1']));
            mockStorage.files.set(join(TEST_CACHE_DIR, '.gitkeep'), new Blob(['']));

            const count = await clearCache(deps);

            expect(count).toBe(1);
            // .gitkeep should remain (it's not .jpg)
        });
    });

    describe('Integration scenarios', () => {
        test('cache miss then cache hit', async () => {
            // First request - cache miss
            const result1 = await getCachedImage('@Channel', 'video1', 'mqdefault', deps);
            expect(result1.fromCache).toBe(false);

            // Wait for cache write
            await new Promise(resolve => setTimeout(resolve, 50));

            // Reset fetch calls
            mockFetcher.reset();

            // Second request - cache hit
            const result2 = await getCachedImage('@Channel', 'video1', 'mqdefault', deps);
            expect(result2.fromCache).toBe(true);
            expect(mockFetcher.calls).toHaveLength(0);
        });

        test('different videos create different cache entries', async () => {
            await getCachedImage('@Channel', 'video1', 'mqdefault', deps);
            await getCachedImage('@Channel', 'video2', 'mqdefault', deps);

            // Wait for cache writes
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockStorage.files.size).toBeGreaterThanOrEqual(2);
            
            const paths = Array.from(mockStorage.files.keys());
            expect(paths.some(p => p.includes('video1'))).toBe(true);
            expect(paths.some(p => p.includes('video2'))).toBe(true);
        });

        test('same video different channels create different cache entries', async () => {
            await getCachedImage('@Channel1', 'sameVideo', 'mqdefault', deps);
            await getCachedImage('@Channel2', 'sameVideo', 'mqdefault', deps);

            // Wait for cache writes
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockStorage.files.size).toBeGreaterThanOrEqual(2);
            
            const paths = Array.from(mockStorage.files.keys());
            expect(paths.some(p => p.includes('Channel1'))).toBe(true);
            expect(paths.some(p => p.includes('Channel2'))).toBe(true);
        });
    });
});
