/**
 * Unit tests for Starred Videos API
 * Tests star/unstar video functionality
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { createInMemoryStore } from '../../../website/store';
import {
    getStarredVideos,
    starVideo,
    unstarVideo,
    type StarredHandlerDeps,
} from '../../../website/routes/starred';
import { createMockCollection } from '../../utils';

describe('Starred Videos API', () => {
    let deps: StarredHandlerDeps;

    beforeEach(() => {
        deps = {
            store: createInMemoryStore(),
        };
    });

    describe('GET /api/collections/:id/starred - getStarredVideos', () => {
        test('returns empty array when no videos are starred', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await getStarredVideos(deps, collection.id);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toEqual([]);
        });

        test('returns starred video IDs', async () => {
            const collection = createMockCollection({
                starredVideos: ['video1', 'video2', 'video3'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await getStarredVideos(deps, collection.id);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toEqual(['video1', 'video2', 'video3']);
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await getStarredVideos(deps, 'non-existent');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('handles collection with undefined starredVideos', async () => {
            const collection = createMockCollection();
            delete (collection as any).starredVideos;
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await getStarredVideos(deps, collection.id);
            const data = await response.json();

            expect(data).toEqual([]);
        });
    });

    describe('POST /api/collections/:id/starred/:videoId - starVideo', () => {
        test('stars a video', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await starVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.starredVideos).toContain('video123');
        });

        test('does not duplicate already starred video', async () => {
            const collection = createMockCollection({
                starredVideos: ['video123'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await starVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(data.starredVideos.filter((v: string) => v === 'video123')).toHaveLength(1);
        });

        test('adds multiple videos', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            await starVideo(deps, collection.id, 'video1');
            await starVideo(deps, collection.id, 'video2');
            const response = await starVideo(deps, collection.id, 'video3');
            const data = await response.json();

            expect(data.starredVideos).toHaveLength(3);
            expect(data.starredVideos).toContain('video1');
            expect(data.starredVideos).toContain('video2');
            expect(data.starredVideos).toContain('video3');
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await starVideo(deps, 'non-existent', 'video123');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('persists starred videos to store', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            await starVideo(deps, collection.id, 'video123');

            const storeData = await deps.store.load();
            expect(storeData.collections[0].starredVideos).toContain('video123');
        });

        test('initializes starredVideos array if undefined', async () => {
            const collection = createMockCollection();
            delete (collection as any).starredVideos;
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await starVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(Array.isArray(data.starredVideos)).toBe(true);
            expect(data.starredVideos).toContain('video123');
        });
    });

    describe('DELETE /api/collections/:id/starred/:videoId - unstarVideo', () => {
        test('unstars a video', async () => {
            const collection = createMockCollection({
                starredVideos: ['video123', 'video456'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await unstarVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.starredVideos).not.toContain('video123');
            expect(data.starredVideos).toContain('video456');
        });

        test('handles unstarring non-starred video gracefully', async () => {
            const collection = createMockCollection({
                starredVideos: ['video456'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await unstarVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.starredVideos).toEqual(['video456']);
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await unstarVideo(deps, 'non-existent', 'video123');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('persists changes to store', async () => {
            const collection = createMockCollection({
                starredVideos: ['video123', 'video456'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            await unstarVideo(deps, collection.id, 'video123');

            const storeData = await deps.store.load();
            expect(storeData.collections[0].starredVideos).not.toContain('video123');
            expect(storeData.collections[0].starredVideos).toContain('video456');
        });

        test('handles undefined starredVideos gracefully', async () => {
            const collection = createMockCollection();
            delete (collection as any).starredVideos;
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await unstarVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.starredVideos).toEqual([]);
        });

        test('can unstar all videos', async () => {
            const collection = createMockCollection({
                starredVideos: ['video1', 'video2'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            await unstarVideo(deps, collection.id, 'video1');
            const response = await unstarVideo(deps, collection.id, 'video2');
            const data = await response.json();

            expect(data.starredVideos).toEqual([]);
        });
    });

    describe('Integration scenarios', () => {
        test('star then unstar returns to original state', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            // Initially empty
            const initial = await getStarredVideos(deps, collection.id);
            expect(await initial.json()).toEqual([]);

            // Star a video
            await starVideo(deps, collection.id, 'video123');

            // Verify starred
            const afterStar = await getStarredVideos(deps, collection.id);
            expect(await afterStar.json()).toEqual(['video123']);

            // Unstar the video
            await unstarVideo(deps, collection.id, 'video123');

            // Verify back to empty
            const afterUnstar = await getStarredVideos(deps, collection.id);
            expect(await afterUnstar.json()).toEqual([]);
        });

        test('starred videos persist across reloads', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            // Star a video
            await starVideo(deps, collection.id, 'video123');

            // "Reload" by creating new deps with same store
            const newDeps = { store: deps.store };

            // Check starred videos still exist
            const response = await getStarredVideos(newDeps, collection.id);
            expect(await response.json()).toEqual(['video123']);
        });

        test('different collections have separate starred lists', async () => {
            const collection1 = createMockCollection({ name: 'Collection 1' });
            const collection2 = createMockCollection({ name: 'Collection 2' });
            deps.store = createInMemoryStore({ collections: [collection1, collection2] });

            // Star different videos in different collections
            await starVideo(deps, collection1.id, 'video1');
            await starVideo(deps, collection2.id, 'video2');

            // Verify they're separate
            const starred1 = await (await getStarredVideos(deps, collection1.id)).json();
            const starred2 = await (await getStarredVideos(deps, collection2.id)).json();

            expect(starred1).toEqual(['video1']);
            expect(starred2).toEqual(['video2']);
        });

        test('starring and hiding are independent', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            // Star a video
            await starVideo(deps, collection.id, 'video123');

            // Verify starred list has the video
            const starred = await (await getStarredVideos(deps, collection.id)).json();
            expect(starred).toEqual(['video123']);

            // Verify the store has starredVideos but hiddenVideos is unaffected
            const storeData = await deps.store.load();
            expect(storeData.collections[0].starredVideos).toContain('video123');
            expect(storeData.collections[0].hiddenVideos || []).not.toContain('video123');
        });
    });
});
