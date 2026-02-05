/**
 * Unit tests for Store Operations
 * Tests data store operations (load, save, migrate)
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { createMockCollection, createMockStoredChannel, getTempTestDir, cleanupTempDir } from '../utils';
import type { ChannelsStore } from '../../website/store';

// We'll test the in-memory store for unit tests (no file I/O)
import { createInMemoryStore } from '../../website/store';

describe('Store Operations', () => {
    describe('createInMemoryStore', () => {
        test('creates empty store by default', async () => {
            const store = createInMemoryStore();
            const data = await store.load();
            
            expect(data).toBeDefined();
            expect(data.collections).toEqual([]);
        });

        test('creates store with initial data', async () => {
            const collection = createMockCollection({ name: 'Initial Collection' });
            const store = createInMemoryStore({ collections: [collection] });
            
            const data = await store.load();
            
            expect(data.collections).toHaveLength(1);
            expect(data.collections[0].name).toBe('Initial Collection');
        });

        test('save persists data in memory', async () => {
            const store = createInMemoryStore();
            const collection = createMockCollection({ name: 'New Collection' });
            
            await store.save({ collections: [collection] });
            const data = await store.load();
            
            expect(data.collections).toHaveLength(1);
            expect(data.collections[0].name).toBe('New Collection');
        });

        test('multiple saves override previous data', async () => {
            const store = createInMemoryStore();
            
            await store.save({ collections: [createMockCollection({ name: 'First' })] });
            await store.save({ collections: [createMockCollection({ name: 'Second' })] });
            
            const data = await store.load();
            
            expect(data.collections).toHaveLength(1);
            expect(data.collections[0].name).toBe('Second');
        });

        test('stores channels within collections', async () => {
            const store = createInMemoryStore();
            const channel = createMockStoredChannel({ handle: '@TestChannel' });
            const collection = createMockCollection({
                name: 'Tech',
                channels: [channel],
            });
            
            await store.save({ collections: [collection] });
            const data = await store.load();
            
            expect(data.collections[0].channels).toHaveLength(1);
            expect(data.collections[0].channels[0].handle).toBe('@TestChannel');
        });
    });

    describe('Store Data Structure', () => {
        test('collection has required fields', async () => {
            const store = createInMemoryStore();
            const collection = createMockCollection();
            
            await store.save({ collections: [collection] });
            const data = await store.load();
            const savedCollection = data.collections[0];
            
            expect(savedCollection.id).toBeDefined();
            expect(savedCollection.name).toBeDefined();
            expect(savedCollection.channels).toBeDefined();
            expect(Array.isArray(savedCollection.channels)).toBe(true);
            expect(savedCollection.createdAt).toBeDefined();
        });

        test('channel has required fields', async () => {
            const store = createInMemoryStore();
            const channel = createMockStoredChannel();
            const collection = createMockCollection({ channels: [channel] });
            
            await store.save({ collections: [collection] });
            const data = await store.load();
            const savedChannel = data.collections[0].channels[0];
            
            expect(savedChannel.id).toBeDefined();
            expect(savedChannel.handle).toBeDefined();
            expect(savedChannel.addedAt).toBeDefined();
            expect(savedChannel.lastUpdated).toBeDefined();
        });

        test('can store multiple collections', async () => {
            const store = createInMemoryStore();
            const collections = [
                createMockCollection({ name: 'Tech' }),
                createMockCollection({ name: 'Movies' }),
                createMockCollection({ name: 'Music' }),
            ];
            
            await store.save({ collections });
            const data = await store.load();
            
            expect(data.collections).toHaveLength(3);
            expect(data.collections.map(c => c.name)).toEqual(['Tech', 'Movies', 'Music']);
        });

        test('can store multiple channels per collection', async () => {
            const store = createInMemoryStore();
            const collection = createMockCollection({
                channels: [
                    createMockStoredChannel({ handle: '@Channel1' }),
                    createMockStoredChannel({ handle: '@Channel2' }),
                    createMockStoredChannel({ handle: '@Channel3' }),
                ],
            });
            
            await store.save({ collections: [collection] });
            const data = await store.load();
            
            expect(data.collections[0].channels).toHaveLength(3);
        });
    });

    describe('Store Interface Contract', () => {
        test('load returns promise', () => {
            const store = createInMemoryStore();
            const result = store.load();
            
            expect(result).toBeInstanceOf(Promise);
        });

        test('save returns promise', () => {
            const store = createInMemoryStore();
            const result = store.save({ collections: [] });
            
            expect(result).toBeInstanceOf(Promise);
        });

        test('separate store instances are isolated', async () => {
            const store1 = createInMemoryStore();
            const store2 = createInMemoryStore();
            
            await store1.save({ collections: [createMockCollection({ name: 'Store1' })] });
            await store2.save({ collections: [createMockCollection({ name: 'Store2' })] });
            
            const data1 = await store1.load();
            const data2 = await store2.load();
            
            expect(data1.collections[0].name).toBe('Store1');
            expect(data2.collections[0].name).toBe('Store2');
        });
    });

    describe('Legacy Data Migration', () => {
        test('empty store has no legacy channels field', async () => {
            const store = createInMemoryStore();
            const data = await store.load();
            
            expect(data.channels).toBeUndefined();
            expect(data.collections).toEqual([]);
        });

        test('can simulate legacy format with channels field', async () => {
            // Simulate a store that had the old format
            const legacyData: ChannelsStore = {
                collections: [],
                channels: [
                    createMockStoredChannel({ handle: '@LegacyChannel' }),
                ],
            };
            
            const store = createInMemoryStore(legacyData);
            const data = await store.load();
            
            // The in-memory store doesn't auto-migrate, it just preserves data
            // Migration happens in the file-based loadStore function
            expect(data.channels).toBeDefined();
            expect(data.channels).toHaveLength(1);
        });
    });

    describe('Edge Cases', () => {
        test('handles empty collections array', async () => {
            const store = createInMemoryStore({ collections: [] });
            const data = await store.load();
            
            expect(data.collections).toEqual([]);
        });

        test('handles collection with no channels', async () => {
            const store = createInMemoryStore();
            const collection = createMockCollection({ channels: [] });
            
            await store.save({ collections: [collection] });
            const data = await store.load();
            
            expect(data.collections[0].channels).toEqual([]);
        });

        test('handles deeply nested data', async () => {
            const store = createInMemoryStore();
            const channelWithData = createMockStoredChannel({
                handle: '@TestChannel',
                data: {
                    channel: {
                        title: 'Test Channel',
                        description: 'A test description',
                    },
                    videos: [
                        { videoId: 'video1', title: 'Video 1' },
                        { videoId: 'video2', title: 'Video 2' },
                    ],
                } as any,
            });
            const collection = createMockCollection({ channels: [channelWithData] });
            
            await store.save({ collections: [collection] });
            const data = await store.load();
            
            expect((data.collections[0].channels[0] as any).data.videos).toHaveLength(2);
        });

        test('handles special characters in names', async () => {
            const store = createInMemoryStore();
            const collection = createMockCollection({
                name: 'Тест Collection 日本語 🎬',
            });
            
            await store.save({ collections: [collection] });
            const data = await store.load();
            
            expect(data.collections[0].name).toBe('Тест Collection 日本語 🎬');
        });

        test('handles very long strings', async () => {
            const store = createInMemoryStore();
            const longName = 'A'.repeat(10000);
            const collection = createMockCollection({ name: longName });
            
            await store.save({ collections: [collection] });
            const data = await store.load();
            
            expect(data.collections[0].name.length).toBe(10000);
        });
    });

    describe('Concurrent Operations', () => {
        test('handles multiple concurrent reads', async () => {
            const store = createInMemoryStore({
                collections: [createMockCollection({ name: 'Concurrent Test' })],
            });
            
            const [data1, data2, data3] = await Promise.all([
                store.load(),
                store.load(),
                store.load(),
            ]);
            
            expect(data1.collections[0].name).toBe('Concurrent Test');
            expect(data2.collections[0].name).toBe('Concurrent Test');
            expect(data3.collections[0].name).toBe('Concurrent Test');
        });

        test('handles multiple concurrent writes', async () => {
            const store = createInMemoryStore();
            
            // All these writes should complete, last one wins
            await Promise.all([
                store.save({ collections: [createMockCollection({ name: 'Write 1' })] }),
                store.save({ collections: [createMockCollection({ name: 'Write 2' })] }),
                store.save({ collections: [createMockCollection({ name: 'Write 3' })] }),
            ]);
            
            const data = await store.load();
            
            // One of the writes should be present
            expect(data.collections).toHaveLength(1);
            expect(['Write 1', 'Write 2', 'Write 3']).toContain(data.collections[0].name);
        });

        test('handles mixed concurrent read/write operations', async () => {
            const store = createInMemoryStore({
                collections: [createMockCollection({ name: 'Initial' })],
            });
            
            // These operations should all complete without errors
            const results = await Promise.allSettled([
                store.load(),
                store.save({ collections: [createMockCollection({ name: 'Updated' })] }),
                store.load(),
            ]);
            
            expect(results.every(r => r.status === 'fulfilled')).toBe(true);
        });
    });
});
