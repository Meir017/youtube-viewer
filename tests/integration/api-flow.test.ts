/**
 * Integration Tests - Full API Flow
 * Tests full API flows with the actual server handlers
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createInMemoryStore } from '../../website/store';
import {
    listCollections,
    createCollection,
    updateCollection,
    deleteCollection,
} from '../../website/routes/collections';
import {
    listChannels,
    addChannel,
    deleteChannel,
    refreshChannel,
} from '../../website/routes/channels';
import {
    getHiddenVideos,
    hideVideo,
    unhideVideo,
} from '../../website/routes/hidden';
import { createMockCollection, createMockStoredChannel, createMockChannelData } from '../utils';

/**
 * Create a mock channel processor for integration tests
 */
function createMockProcessor() {
    return {
        async processChannelForWeb(handle: string, config?: { maxAgeDays?: number }) {
            return {
                channel: {
                    title: handle.replace('@', ''),
                    description: `${handle} channel description`,
                    vanityUrl: handle,
                    externalId: 'UC' + Math.random().toString(36).substring(2),
                    avatar: 'https://yt3.googleusercontent.com/avatar.jpg',
                    subscriberCount: '10K subscribers',
                },
                videos: [
                    {
                        videoId: `video_${Date.now()}_1`,
                        title: 'Test Video 1',
                        thumbnail: 'https://i.ytimg.com/vi/test1/mqdefault.jpg',
                        duration: '10:00',
                        views: '1K views',
                        uploadedAt: '1 day ago',
                        isShort: false,
                    },
                    {
                        videoId: `video_${Date.now()}_2`,
                        title: 'Test Video 2',
                        thumbnail: 'https://i.ytimg.com/vi/test2/mqdefault.jpg',
                        duration: '5:00',
                        views: '500 views',
                        uploadedAt: '2 days ago',
                        isShort: false,
                    },
                ],
            };
        },
    };
}

describe('Integration Tests - Full API Flow', () => {
    describe('Collection -> Channel -> Videos Flow', () => {
        test('create collection, add channel, view videos', async () => {
            const store = createInMemoryStore();
            const processor = createMockProcessor();

            // Step 1: Create a collection
            const createResponse = await createCollection(
                { store },
                { name: 'Tech Channels' }
            );
            expect(createResponse.status).toBe(201);
            const collection = await createResponse.json();
            expect(collection.name).toBe('Tech Channels');

            // Step 2: Add a channel to the collection
            const addResponse = await addChannel(
                { store, channelProcessor: processor },
                collection.id,
                { handle: '@GitHub' }
            );
            expect(addResponse.status).toBe(201);
            const channel = await addResponse.json();
            expect(channel.handle).toBe('@GitHub');
            expect(channel.data).toBeDefined();
            expect(channel.data.videos.length).toBeGreaterThan(0);

            // Step 3: List channels to verify
            const listResponse = await listChannels(
                { store, channelProcessor: processor },
                collection.id
            );
            expect(listResponse.status).toBe(200);
            const channels = await listResponse.json();
            expect(channels).toHaveLength(1);
            expect(channels[0].handle).toBe('@GitHub');
        });

        test('add multiple channels to same collection', async () => {
            const store = createInMemoryStore();
            const processor = createMockProcessor();

            // Create collection
            const createResponse = await createCollection(
                { store },
                { name: 'Multiple Channels' }
            );
            const collection = await createResponse.json();

            // Add multiple channels
            await addChannel({ store, channelProcessor: processor }, collection.id, { handle: '@Channel1' });
            await addChannel({ store, channelProcessor: processor }, collection.id, { handle: '@Channel2' });
            await addChannel({ store, channelProcessor: processor }, collection.id, { handle: '@Channel3' });

            // Verify all channels are added
            const listResponse = await listChannels(
                { store, channelProcessor: processor },
                collection.id
            );
            const channels = await listResponse.json();
            expect(channels).toHaveLength(3);
        });

        test('add channels to different collections', async () => {
            const store = createInMemoryStore();
            const processor = createMockProcessor();

            // Create two collections
            const collection1 = await (await createCollection({ store }, { name: 'Collection 1' })).json();
            const collection2 = await (await createCollection({ store }, { name: 'Collection 2' })).json();

            // Add channel to each
            await addChannel({ store, channelProcessor: processor }, collection1.id, { handle: '@ChannelA' });
            await addChannel({ store, channelProcessor: processor }, collection2.id, { handle: '@ChannelB' });

            // Verify isolation
            const channels1 = await (await listChannels({ store, channelProcessor: processor }, collection1.id)).json();
            const channels2 = await (await listChannels({ store, channelProcessor: processor }, collection2.id)).json();

            expect(channels1).toHaveLength(1);
            expect(channels1[0].handle).toBe('@ChannelA');
            expect(channels2).toHaveLength(1);
            expect(channels2[0].handle).toBe('@ChannelB');
        });
    });

    describe('Refresh Flow - Enrichment Preservation', () => {
        test('refresh preserves enrichment data for existing videos', async () => {
            // Create collection with pre-enriched channel
            const channelWithEnrichment = createMockStoredChannel({
                handle: '@EnrichedChannel',
                data: {
                    channel: createMockChannelData().channel,
                    videos: [
                        {
                            videoId: 'enriched_video_1',
                            title: 'Enriched Video',
                            thumbnail: 'https://i.ytimg.com/vi/enriched_video_1/mqdefault.jpg',
                            duration: '10:00',
                            views: '1K views',
                            uploadedAt: '1 day ago',
                            isShort: false,
                            publishDate: '2024-01-15',
                            description: 'This is an enriched description',
                        },
                    ],
                } as any,
            });

            const collection = createMockCollection({
                channels: [channelWithEnrichment],
            });
            const store = createInMemoryStore({ collections: [collection] });

            // Create a processor that returns the same video ID but without enrichment
            const processor = {
                async processChannelForWeb(handle: string) {
                    return {
                        channel: createMockChannelData().channel,
                        videos: [
                            {
                                videoId: 'enriched_video_1',  // Same video ID
                                title: 'Enriched Video Updated',
                                thumbnail: 'https://i.ytimg.com/vi/enriched_video_1/mqdefault.jpg',
                                duration: '10:00',
                                views: '2K views',  // Updated view count
                                uploadedAt: '2 days ago',
                                isShort: false,
                                // No enrichment data
                            },
                        ],
                    };
                },
            };

            // Refresh the channel
            await refreshChannel(
                { store, channelProcessor: processor },
                collection.id,
                channelWithEnrichment.id
            );

            // Verify enrichment data is preserved
            const storeData = await store.load();
            const refreshedVideo = storeData.collections[0].channels[0].data?.videos[0];
            
            expect(refreshedVideo?.publishDate).toBe('2024-01-15');
            expect(refreshedVideo?.description).toBe('This is an enriched description');
            expect(refreshedVideo?.views).toBe('2K views');  // But other data is updated
        });
    });

    describe('Concurrent Operations', () => {
        test('concurrent reads do not interfere', async () => {
            const store = createInMemoryStore({
                collections: [
                    createMockCollection({ name: 'Test 1' }),
                    createMockCollection({ name: 'Test 2' }),
                ],
            });

            // Perform multiple concurrent reads
            const results = await Promise.all([
                listCollections({ store }),
                listCollections({ store }),
                listCollections({ store }),
            ]);

            // All should return the same data
            for (const response of results) {
                const data = await response.json();
                expect(data).toHaveLength(2);
            }
        });

        test('concurrent writes to different collections', async () => {
            const store = createInMemoryStore();

            // Create collections concurrently
            const results = await Promise.all([
                createCollection({ store }, { name: 'Concurrent 1' }),
                createCollection({ store }, { name: 'Concurrent 2' }),
                createCollection({ store }, { name: 'Concurrent 3' }),
            ]);

            // All should succeed
            for (const response of results) {
                expect(response.status).toBe(201);
            }

            // Final state should have all 3 collections
            const finalResponse = await listCollections({ store });
            const collections = await finalResponse.json();
            expect(collections).toHaveLength(3);
        });
    });

    describe('Error Handling', () => {
        test('returns 404 for operations on non-existent collection', async () => {
            const store = createInMemoryStore();
            const processor = createMockProcessor();

            const responses = await Promise.all([
                listChannels({ store, channelProcessor: processor }, 'fake-id'),
                addChannel({ store, channelProcessor: processor }, 'fake-id', { handle: '@Test' }),
                deleteChannel({ store, channelProcessor: processor }, 'fake-id', 'fake-channel'),
            ]);

            for (const response of responses) {
                expect(response.status).toBe(404);
            }
        });

        test('returns 400 for invalid input', async () => {
            const store = createInMemoryStore();

            // Empty name
            const emptyNameResponse = await createCollection({ store }, { name: '' });
            expect(emptyNameResponse.status).toBe(400);

            // Whitespace only name
            const whitespaceResponse = await createCollection({ store }, { name: '   ' });
            expect(whitespaceResponse.status).toBe(400);
        });

        test('returns 409 for duplicate channel in same collection', async () => {
            const store = createInMemoryStore();
            const processor = createMockProcessor();

            // Create collection and add channel
            const collection = await (await createCollection({ store }, { name: 'Test' })).json();
            await addChannel({ store, channelProcessor: processor }, collection.id, { handle: '@Duplicate' });

            // Try to add same channel again
            const duplicateResponse = await addChannel(
                { store, channelProcessor: processor },
                collection.id,
                { handle: '@Duplicate' }
            );
            expect(duplicateResponse.status).toBe(409);
        });
    });

    describe('Hidden Videos Flow', () => {
        test('hide and unhide video flow', async () => {
            const store = createInMemoryStore();

            // Create collection
            const collection = await (await createCollection({ store }, { name: 'Hidden Test' })).json();

            // Initially no hidden videos
            const initialHidden = await (await getHiddenVideos({ store }, collection.id)).json();
            expect(initialHidden).toEqual([]);

            // Hide a video
            await hideVideo({ store }, collection.id, 'video123');

            // Verify hidden
            const afterHide = await (await getHiddenVideos({ store }, collection.id)).json();
            expect(afterHide).toContain('video123');

            // Unhide
            await unhideVideo({ store }, collection.id, 'video123');

            // Verify unhidden
            const afterUnhide = await (await getHiddenVideos({ store }, collection.id)).json();
            expect(afterUnhide).not.toContain('video123');
        });

        test('hidden videos are isolated per collection', async () => {
            const store = createInMemoryStore();

            // Create two collections
            const collection1 = await (await createCollection({ store }, { name: 'Collection 1' })).json();
            const collection2 = await (await createCollection({ store }, { name: 'Collection 2' })).json();

            // Hide video in collection 1
            await hideVideo({ store }, collection1.id, 'video_in_1');

            // Hide different video in collection 2
            await hideVideo({ store }, collection2.id, 'video_in_2');

            // Verify isolation
            const hidden1 = await (await getHiddenVideos({ store }, collection1.id)).json();
            const hidden2 = await (await getHiddenVideos({ store }, collection2.id)).json();

            expect(hidden1).toContain('video_in_1');
            expect(hidden1).not.toContain('video_in_2');
            expect(hidden2).toContain('video_in_2');
            expect(hidden2).not.toContain('video_in_1');
        });
    });

    describe('Full CRUD Cycle', () => {
        test('complete collection lifecycle', async () => {
            const store = createInMemoryStore();
            const processor = createMockProcessor();

            // Create
            const createResponse = await createCollection({ store }, { name: 'Lifecycle Test' });
            expect(createResponse.status).toBe(201);
            const collection = await createResponse.json();

            // Read
            const listResponse = await listCollections({ store });
            const collections = await listResponse.json();
            expect(collections.some((c: any) => c.name === 'Lifecycle Test')).toBe(true);

            // Update
            const updateResponse = await updateCollection({ store }, collection.id, { name: 'Updated Name' });
            expect(updateResponse.status).toBe(200);
            const updated = await updateResponse.json();
            expect(updated.name).toBe('Updated Name');

            // Delete
            const deleteResponse = await deleteCollection({ store }, collection.id);
            expect(deleteResponse.status).toBe(200);

            // Verify deleted
            const finalList = await (await listCollections({ store })).json();
            expect(finalList.some((c: any) => c.id === collection.id)).toBe(false);
        });

        test('complete channel lifecycle within collection', async () => {
            const store = createInMemoryStore();
            const processor = createMockProcessor();

            // Create collection
            const collection = await (await createCollection({ store }, { name: 'Channel Lifecycle' })).json();

            // Add channel
            const addResponse = await addChannel(
                { store, channelProcessor: processor },
                collection.id,
                { handle: '@LifecycleChannel' }
            );
            expect(addResponse.status).toBe(201);
            const channel = await addResponse.json();

            // Refresh channel
            const refreshResponse = await refreshChannel(
                { store, channelProcessor: processor },
                collection.id,
                channel.id
            );
            expect(refreshResponse.status).toBe(200);

            // Delete channel
            const deleteResponse = await deleteChannel(
                { store, channelProcessor: processor },
                collection.id,
                channel.id
            );
            expect(deleteResponse.status).toBe(200);

            // Verify deleted
            const channels = await (await listChannels(
                { store, channelProcessor: processor },
                collection.id
            )).json();
            expect(channels).toHaveLength(0);
        });
    });
});
