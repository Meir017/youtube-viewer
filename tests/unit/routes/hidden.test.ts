/**
 * Unit tests for Hidden Videos API
 * Tests hide/unhide video functionality
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { createInMemoryStore } from '../../../website/store';
import {
    getHiddenVideos,
    hideVideo,
    unhideVideo,
    type HiddenHandlerDeps,
} from '../../../website/routes/hidden';
import { createMockCollection } from '../../utils';

describe('Hidden Videos API', () => {
    let deps: HiddenHandlerDeps;

    beforeEach(() => {
        deps = {
            store: createInMemoryStore(),
        };
    });

    describe('GET /api/collections/:id/hidden - getHiddenVideos', () => {
        test('returns empty array when no videos are hidden', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await getHiddenVideos(deps, collection.id);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toEqual([]);
        });

        test('returns hidden video IDs', async () => {
            const collection = createMockCollection({
                hiddenVideos: ['video1', 'video2', 'video3'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await getHiddenVideos(deps, collection.id);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toEqual(['video1', 'video2', 'video3']);
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await getHiddenVideos(deps, 'non-existent');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('handles collection with undefined hiddenVideos', async () => {
            const collection = createMockCollection();
            delete (collection as any).hiddenVideos;
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await getHiddenVideos(deps, collection.id);
            const data = await response.json();

            expect(data).toEqual([]);
        });
    });

    describe('POST /api/collections/:id/hidden/:videoId - hideVideo', () => {
        test('hides a video', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await hideVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.hiddenVideos).toContain('video123');
        });

        test('does not duplicate already hidden video', async () => {
            const collection = createMockCollection({
                hiddenVideos: ['video123'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await hideVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(data.hiddenVideos.filter((v: string) => v === 'video123')).toHaveLength(1);
        });

        test('adds multiple videos', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            await hideVideo(deps, collection.id, 'video1');
            await hideVideo(deps, collection.id, 'video2');
            const response = await hideVideo(deps, collection.id, 'video3');
            const data = await response.json();

            expect(data.hiddenVideos).toHaveLength(3);
            expect(data.hiddenVideos).toContain('video1');
            expect(data.hiddenVideos).toContain('video2');
            expect(data.hiddenVideos).toContain('video3');
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await hideVideo(deps, 'non-existent', 'video123');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('persists hidden videos to store', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            await hideVideo(deps, collection.id, 'video123');

            const storeData = await deps.store.load();
            expect(storeData.collections[0].hiddenVideos).toContain('video123');
        });

        test('initializes hiddenVideos array if undefined', async () => {
            const collection = createMockCollection();
            delete (collection as any).hiddenVideos;
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await hideVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(Array.isArray(data.hiddenVideos)).toBe(true);
            expect(data.hiddenVideos).toContain('video123');
        });
    });

    describe('DELETE /api/collections/:id/hidden/:videoId - unhideVideo', () => {
        test('unhides a video', async () => {
            const collection = createMockCollection({
                hiddenVideos: ['video123', 'video456'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await unhideVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.hiddenVideos).not.toContain('video123');
            expect(data.hiddenVideos).toContain('video456');
        });

        test('handles unhiding non-hidden video gracefully', async () => {
            const collection = createMockCollection({
                hiddenVideos: ['video456'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await unhideVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.hiddenVideos).toEqual(['video456']);
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await unhideVideo(deps, 'non-existent', 'video123');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('persists changes to store', async () => {
            const collection = createMockCollection({
                hiddenVideos: ['video123', 'video456'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            await unhideVideo(deps, collection.id, 'video123');

            const storeData = await deps.store.load();
            expect(storeData.collections[0].hiddenVideos).not.toContain('video123');
            expect(storeData.collections[0].hiddenVideos).toContain('video456');
        });

        test('handles undefined hiddenVideos gracefully', async () => {
            const collection = createMockCollection();
            delete (collection as any).hiddenVideos;
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await unhideVideo(deps, collection.id, 'video123');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.hiddenVideos).toEqual([]);
        });

        test('can unhide all videos', async () => {
            const collection = createMockCollection({
                hiddenVideos: ['video1', 'video2'],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            await unhideVideo(deps, collection.id, 'video1');
            const response = await unhideVideo(deps, collection.id, 'video2');
            const data = await response.json();

            expect(data.hiddenVideos).toEqual([]);
        });
    });

    describe('Integration scenarios', () => {
        test('hide then unhide returns to original state', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            // Initially empty
            const initial = await getHiddenVideos(deps, collection.id);
            expect(await initial.json()).toEqual([]);

            // Hide a video
            await hideVideo(deps, collection.id, 'video123');

            // Verify hidden
            const afterHide = await getHiddenVideos(deps, collection.id);
            expect(await afterHide.json()).toEqual(['video123']);

            // Unhide the video
            await unhideVideo(deps, collection.id, 'video123');

            // Verify back to empty
            const afterUnhide = await getHiddenVideos(deps, collection.id);
            expect(await afterUnhide.json()).toEqual([]);
        });

        test('hidden videos persist across reloads', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            // Hide a video
            await hideVideo(deps, collection.id, 'video123');

            // "Reload" by creating new deps with same store
            const newDeps = { store: deps.store };

            // Check hidden videos still exist
            const response = await getHiddenVideos(newDeps, collection.id);
            expect(await response.json()).toEqual(['video123']);
        });

        test('different collections have separate hidden lists', async () => {
            const collection1 = createMockCollection({ name: 'Collection 1' });
            const collection2 = createMockCollection({ name: 'Collection 2' });
            deps.store = createInMemoryStore({ collections: [collection1, collection2] });

            // Hide different videos in different collections
            await hideVideo(deps, collection1.id, 'video1');
            await hideVideo(deps, collection2.id, 'video2');

            // Verify they're separate
            const hidden1 = await (await getHiddenVideos(deps, collection1.id)).json();
            const hidden2 = await (await getHiddenVideos(deps, collection2.id)).json();

            expect(hidden1).toEqual(['video1']);
            expect(hidden2).toEqual(['video2']);
        });
    });
});
