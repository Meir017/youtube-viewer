/**
 * Unit tests for Collections API
 * Tests CRUD operations for collections
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { createInMemoryStore } from '../../../website/store';
import {
    listCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    type CollectionsHandlerDeps,
} from '../../../website/routes/collections';
import { createMockCollection, createMockStoredChannel } from '../../utils';

describe('Collections API', () => {
    let deps: CollectionsHandlerDeps;

    beforeEach(() => {
        deps = {
            store: createInMemoryStore(),
        };
    });

    describe('GET /api/collections - listCollections', () => {
        test('returns empty array when no collections exist', async () => {
            const response = await listCollections(deps);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toEqual([]);
        });

        test('returns all collections', async () => {
            const collections = [
                createMockCollection({ name: 'Tech' }),
                createMockCollection({ name: 'Movies' }),
            ];
            deps.store = createInMemoryStore({ collections });

            const response = await listCollections(deps);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveLength(2);
            expect(data[0].name).toBe('Tech');
            expect(data[1].name).toBe('Movies');
        });

        test('returns collections with their channels', async () => {
            const collection = createMockCollection({
                name: 'Tech',
                channels: [
                    createMockStoredChannel({ handle: '@GitHub' }),
                    createMockStoredChannel({ handle: '@TypeScript' }),
                ],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await listCollections(deps);
            const data = await response.json();

            expect(data[0].channels).toHaveLength(2);
            expect(data[0].channels[0].handle).toBe('@GitHub');
        });

        test('returns collection metadata (id, name, createdAt)', async () => {
            const collection = createMockCollection({
                name: 'Test',
                createdAt: '2024-01-15T10:00:00.000Z',
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await listCollections(deps);
            const data = await response.json();

            expect(data[0].id).toBeDefined();
            expect(data[0].name).toBe('Test');
            expect(data[0].createdAt).toBe('2024-01-15T10:00:00.000Z');
        });
    });

    describe('POST /api/collections - createCollection', () => {
        test('creates new collection with valid name', async () => {
            const response = await createCollection(deps, { name: 'Tech Channels' });
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.name).toBe('Tech Channels');
            expect(data.id).toBeDefined();
            expect(data.channels).toEqual([]);
            expect(data.createdAt).toBeDefined();
        });

        test('returns 400 when name is missing', async () => {
            const response = await createCollection(deps, {});
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Name is required');
        });

        test('returns 400 when name is empty string', async () => {
            const response = await createCollection(deps, { name: '' });
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Name is required');
        });

        test('returns 400 when name is whitespace only', async () => {
            const response = await createCollection(deps, { name: '   ' });
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Name is required');
        });

        test('trims whitespace from name', async () => {
            const response = await createCollection(deps, { name: '  Tech Channels  ' });
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.name).toBe('Tech Channels');
        });

        test('persists collection to store', async () => {
            await createCollection(deps, { name: 'New Collection' });

            const storeData = await deps.store.load();
            expect(storeData.collections).toHaveLength(1);
            expect(storeData.collections[0].name).toBe('New Collection');
        });

        test('allows duplicate names', async () => {
            await createCollection(deps, { name: 'Same Name' });
            const response = await createCollection(deps, { name: 'Same Name' });

            expect(response.status).toBe(201);

            const storeData = await deps.store.load();
            expect(storeData.collections).toHaveLength(2);
        });

        test('generates unique IDs for each collection', async () => {
            const response1 = await createCollection(deps, { name: 'Collection 1' });
            const response2 = await createCollection(deps, { name: 'Collection 2' });

            const data1 = await response1.json();
            const data2 = await response2.json();

            expect(data1.id).not.toBe(data2.id);
        });
    });

    describe('PUT /api/collections/:id - updateCollection', () => {
        test('updates collection name', async () => {
            const collection = createMockCollection({ name: 'Old Name' });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await updateCollection(deps, collection.id, { name: 'New Name' });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.name).toBe('New Name');
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await updateCollection(deps, 'non-existent-id', { name: 'Name' });
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('returns 400 when name is missing', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await updateCollection(deps, collection.id, {});
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Name is required');
        });

        test('returns 400 when name is empty', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await updateCollection(deps, collection.id, { name: '' });
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Name is required');
        });

        test('trims whitespace from name', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await updateCollection(deps, collection.id, { name: '  Updated  ' });
            const data = await response.json();

            expect(data.name).toBe('Updated');
        });

        test('persists update to store', async () => {
            const collection = createMockCollection({ name: 'Original' });
            deps.store = createInMemoryStore({ collections: [collection] });

            await updateCollection(deps, collection.id, { name: 'Updated' });

            const storeData = await deps.store.load();
            expect(storeData.collections[0].name).toBe('Updated');
        });

        test('preserves collection ID after update', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await updateCollection(deps, collection.id, { name: 'Updated' });
            const data = await response.json();

            expect(data.id).toBe(collection.id);
        });

        test('preserves channels after name update', async () => {
            const collection = createMockCollection({
                name: 'Tech',
                channels: [createMockStoredChannel({ handle: '@GitHub' })],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await updateCollection(deps, collection.id, { name: 'Updated Tech' });
            const data = await response.json();

            expect(data.channels).toHaveLength(1);
            expect(data.channels[0].handle).toBe('@GitHub');
        });
    });

    describe('DELETE /api/collections/:id - deleteCollection', () => {
        test('deletes existing collection', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await deleteCollection(deps, collection.id);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await deleteCollection(deps, 'non-existent-id');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('removes collection from store', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            await deleteCollection(deps, collection.id);

            const storeData = await deps.store.load();
            expect(storeData.collections).toHaveLength(0);
        });

        test('only deletes specified collection', async () => {
            const collection1 = createMockCollection({ name: 'Keep This' });
            const collection2 = createMockCollection({ name: 'Delete This' });
            deps.store = createInMemoryStore({ collections: [collection1, collection2] });

            await deleteCollection(deps, collection2.id);

            const storeData = await deps.store.load();
            expect(storeData.collections).toHaveLength(1);
            expect(storeData.collections[0].name).toBe('Keep This');
        });

        test('can delete collection with channels', async () => {
            const collection = createMockCollection({
                channels: [
                    createMockStoredChannel({ handle: '@Channel1' }),
                    createMockStoredChannel({ handle: '@Channel2' }),
                ],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await deleteCollection(deps, collection.id);

            expect(response.status).toBe(200);

            const storeData = await deps.store.load();
            expect(storeData.collections).toHaveLength(0);
        });

        test('returns 404 when deleting already deleted collection', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            // First delete succeeds
            await deleteCollection(deps, collection.id);

            // Second delete returns 404
            const response = await deleteCollection(deps, collection.id);
            expect(response.status).toBe(404);
        });
    });

    describe('Integration scenarios', () => {
        test('create then list collections', async () => {
            await createCollection(deps, { name: 'First' });
            await createCollection(deps, { name: 'Second' });

            const response = await listCollections(deps);
            const data = await response.json();

            expect(data).toHaveLength(2);
        });

        test('create, update, then list', async () => {
            const createResponse = await createCollection(deps, { name: 'Original' });
            const { id } = await createResponse.json();

            await updateCollection(deps, id, { name: 'Updated' });

            const listResponse = await listCollections(deps);
            const data = await listResponse.json();

            expect(data[0].name).toBe('Updated');
        });

        test('create, delete, then list returns empty', async () => {
            const createResponse = await createCollection(deps, { name: 'Temporary' });
            const { id } = await createResponse.json();

            await deleteCollection(deps, id);

            const listResponse = await listCollections(deps);
            const data = await listResponse.json();

            expect(data).toEqual([]);
        });

        test('full CRUD cycle', async () => {
            // Create
            const createResponse = await createCollection(deps, { name: 'Test Collection' });
            expect(createResponse.status).toBe(201);
            const { id } = await createResponse.json();

            // Read
            const listResponse1 = await listCollections(deps);
            const list1 = await listResponse1.json();
            expect(list1).toHaveLength(1);

            // Update
            const updateResponse = await updateCollection(deps, id, { name: 'Updated Collection' });
            expect(updateResponse.status).toBe(200);

            // Verify update
            const listResponse2 = await listCollections(deps);
            const list2 = await listResponse2.json();
            expect(list2[0].name).toBe('Updated Collection');

            // Delete
            const deleteResponse = await deleteCollection(deps, id);
            expect(deleteResponse.status).toBe(200);

            // Verify delete
            const listResponse3 = await listCollections(deps);
            const list3 = await listResponse3.json();
            expect(list3).toHaveLength(0);
        });
    });
});
