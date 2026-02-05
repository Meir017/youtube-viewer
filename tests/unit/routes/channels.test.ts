/**
 * Unit tests for Channels API
 * Tests channel operations within collections
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { createInMemoryStore } from '../../../website/store';
import {
    listChannels,
    addChannel,
    deleteChannel,
    refreshChannel,
    type ChannelsHandlerDeps,
    type ChannelProcessor,
} from '../../../website/routes/channels';
import { createMockCollection, createMockStoredChannel, createMockChannelData } from '../../utils';

/**
 * Creates a mock channel processor for testing
 */
function createMockChannelProcessor(
    overrides: Partial<{
        channelData: ReturnType<typeof createMockChannelData>;
        shouldFail: boolean;
        errorMessage: string;
    }> = {}
): ChannelProcessor & { calls: string[] } {
    const calls: string[] = [];
    const { 
        channelData = createMockChannelData(), 
        shouldFail = false,
        errorMessage = 'Mock error'
    } = overrides;

    return {
        calls,
        async processChannelForWeb(handle: string, config?: { maxAgeDays?: number }) {
            calls.push(handle);
            if (shouldFail) {
                throw new Error(errorMessage);
            }
            // Return channel data with the handle properly set
            return {
                ...channelData,
                channel: {
                    ...channelData.channel,
                    vanityUrl: handle,
                },
            };
        },
    };
}

describe('Channels API', () => {
    let deps: ChannelsHandlerDeps;
    let mockProcessor: ChannelProcessor & { calls: string[] };

    beforeEach(() => {
        mockProcessor = createMockChannelProcessor();
        deps = {
            store: createInMemoryStore(),
            channelProcessor: mockProcessor,
        };
    });

    describe('GET /api/collections/:id/channels - listChannels', () => {
        test('returns empty array for collection with no channels', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await listChannels(deps, collection.id);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toEqual([]);
        });

        test('returns channels for existing collection', async () => {
            const collection = createMockCollection({
                channels: [
                    createMockStoredChannel({ handle: '@GitHub' }),
                    createMockStoredChannel({ handle: '@TypeScript' }),
                ],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await listChannels(deps, collection.id);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveLength(2);
            expect(data[0].handle).toBe('@GitHub');
            expect(data[1].handle).toBe('@TypeScript');
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await listChannels(deps, 'non-existent-id');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('refreshes all channels when maxAgeDays is provided', async () => {
            const collection = createMockCollection({
                channels: [
                    createMockStoredChannel({ handle: '@Channel1' }),
                    createMockStoredChannel({ handle: '@Channel2' }),
                ],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await listChannels(deps, collection.id, 30);

            expect(response.status).toBe(200);
            expect(mockProcessor.calls).toContain('@Channel1');
            expect(mockProcessor.calls).toContain('@Channel2');
        });

        test('updates lastUpdated when refreshing channels', async () => {
            const oldDate = '2023-01-01T00:00:00.000Z';
            const collection = createMockCollection({
                channels: [
                    createMockStoredChannel({ handle: '@TestChannel', lastUpdated: oldDate }),
                ],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            await listChannels(deps, collection.id, 30);

            const storeData = await deps.store.load();
            const updatedChannel = storeData.collections[0].channels[0];
            expect(updatedChannel.lastUpdated).not.toBe(oldDate);
        });

        test('preserves enrichment data during refresh', async () => {
            // Create channel with enriched video data
            const channelWithEnrichment = createMockStoredChannel({
                handle: '@TestChannel',
                data: {
                    channel: createMockChannelData().channel,
                    videos: [
                        {
                            videoId: 'video123',
                            title: 'Test Video',
                            thumbnail: 'https://i.ytimg.com/vi/video123/mqdefault.jpg',
                            duration: '10:00',
                            views: '1000 views',
                            uploadedAt: '2 days ago',
                            isShort: false,
                            publishDate: '2024-01-15',  // Enrichment data
                            description: 'Enriched description',  // Enrichment data
                        },
                    ],
                } as any,
            });

            const collection = createMockCollection({
                channels: [channelWithEnrichment],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            // Mock processor returns the same video ID
            mockProcessor = createMockChannelProcessor({
                channelData: {
                    channel: createMockChannelData().channel,
                    videos: [
                        {
                            videoId: 'video123',  // Same video ID
                            title: 'Test Video Updated',
                            thumbnail: 'https://i.ytimg.com/vi/video123/mqdefault.jpg',
                            duration: '10:00',
                            views: '2000 views',
                            uploadedAt: '3 days ago',
                            isShort: false,
                        },
                    ],
                },
            });
            deps.channelProcessor = mockProcessor;

            await listChannels(deps, collection.id, 30);

            const storeData = await deps.store.load();
            const refreshedVideo = storeData.collections[0].channels[0].data?.videos[0];
            
            expect(refreshedVideo?.publishDate).toBe('2024-01-15');
            expect(refreshedVideo?.description).toBe('Enriched description');
        });

        test('continues refreshing other channels if one fails', async () => {
            let callCount = 0;
            const mixedProcessor: ChannelProcessor = {
                async processChannelForWeb(handle: string) {
                    callCount++;
                    if (handle === '@FailChannel') {
                        throw new Error('Network error');
                    }
                    return createMockChannelData();
                },
            };
            deps.channelProcessor = mixedProcessor;

            const collection = createMockCollection({
                channels: [
                    createMockStoredChannel({ handle: '@FailChannel' }),
                    createMockStoredChannel({ handle: '@SuccessChannel' }),
                ],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await listChannels(deps, collection.id, 30);

            expect(response.status).toBe(200);
            expect(callCount).toBe(2);  // Both channels were attempted
        });
    });

    describe('POST /api/collections/:id/channels - addChannel', () => {
        test('adds new channel to collection', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await addChannel(deps, collection.id, { handle: '@NewChannel' });
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.handle).toBe('@NewChannel');
            expect(data.id).toBeDefined();
        });

        test('normalizes handle by adding @ prefix', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await addChannel(deps, collection.id, { handle: 'NoAtPrefix' });
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.handle).toBe('@NoAtPrefix');
        });

        test('does not double-prefix handles starting with @', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await addChannel(deps, collection.id, { handle: '@HasAtPrefix' });
            const data = await response.json();

            expect(data.handle).toBe('@HasAtPrefix');
        });

        test('returns 400 when handle is missing', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await addChannel(deps, collection.id, {});
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Handle is required');
        });

        test('returns 400 when handle is empty', async () => {
            const collection = createMockCollection();
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await addChannel(deps, collection.id, { handle: '' });
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Handle is required');
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await addChannel(deps, 'non-existent-id', { handle: '@Test' });
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('returns 409 for duplicate channel (case insensitive)', async () => {
            const collection = createMockCollection({
                channels: [createMockStoredChannel({ handle: '@Existing' })],
            });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await addChannel(deps, collection.id, { handle: '@existing' });
            const data = await response.json();

            expect(response.status).toBe(409);
            expect(data.error).toBe('Channel already exists in this collection');
        });

        test('allows same channel in different collections', async () => {
            const collection1 = createMockCollection({
                channels: [createMockStoredChannel({ handle: '@SharedChannel' })],
            });
            const collection2 = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection1, collection2] });

            const response = await addChannel(deps, collection2.id, { handle: '@SharedChannel' });

            expect(response.status).toBe(201);
        });

        test('fetches channel data from processor', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            await addChannel(deps, collection.id, { handle: '@TestChannel' });

            expect(mockProcessor.calls).toContain('@TestChannel');
        });

        test('persists channel with data to store', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            await addChannel(deps, collection.id, { handle: '@NewChannel' });

            const storeData = await deps.store.load();
            const savedChannel = storeData.collections[0].channels[0];
            expect(savedChannel.data).toBeDefined();
            expect(savedChannel.addedAt).toBeDefined();
            expect(savedChannel.lastUpdated).toBeDefined();
        });

        test('trims whitespace from handle', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await addChannel(deps, collection.id, { handle: '  @TestChannel  ' });
            const data = await response.json();

            expect(data.handle).toBe('@TestChannel');
        });
    });

    describe('DELETE /api/collections/:id/channels/:channelId - deleteChannel', () => {
        test('deletes channel from collection', async () => {
            const channel = createMockStoredChannel({ handle: '@ToDelete' });
            const collection = createMockCollection({ channels: [channel] });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await deleteChannel(deps, collection.id, channel.id);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        test('removes channel from store', async () => {
            const channel = createMockStoredChannel();
            const collection = createMockCollection({ channels: [channel] });
            deps.store = createInMemoryStore({ collections: [collection] });

            await deleteChannel(deps, collection.id, channel.id);

            const storeData = await deps.store.load();
            expect(storeData.collections[0].channels).toHaveLength(0);
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await deleteChannel(deps, 'non-existent', 'some-channel-id');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('returns 404 for non-existent channel', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await deleteChannel(deps, collection.id, 'non-existent');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Channel not found');
        });

        test('only deletes specified channel', async () => {
            const channel1 = createMockStoredChannel({ handle: '@Keep' });
            const channel2 = createMockStoredChannel({ handle: '@Delete' });
            const collection = createMockCollection({ channels: [channel1, channel2] });
            deps.store = createInMemoryStore({ collections: [collection] });

            await deleteChannel(deps, collection.id, channel2.id);

            const storeData = await deps.store.load();
            expect(storeData.collections[0].channels).toHaveLength(1);
            expect(storeData.collections[0].channels[0].handle).toBe('@Keep');
        });
    });

    describe('POST /api/collections/:id/channels/:channelId/refresh - refreshChannel', () => {
        test('refreshes channel data', async () => {
            const channel = createMockStoredChannel({ handle: '@ToRefresh' });
            const collection = createMockCollection({ channels: [channel] });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await refreshChannel(deps, collection.id, channel.id);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.handle).toBe('@ToRefresh');
            expect(mockProcessor.calls).toContain('@ToRefresh');
        });

        test('updates lastUpdated timestamp', async () => {
            const oldDate = '2023-01-01T00:00:00.000Z';
            const channel = createMockStoredChannel({ 
                handle: '@TestChannel',
                lastUpdated: oldDate,
            });
            const collection = createMockCollection({ channels: [channel] });
            deps.store = createInMemoryStore({ collections: [collection] });

            await refreshChannel(deps, collection.id, channel.id);

            const storeData = await deps.store.load();
            expect(storeData.collections[0].channels[0].lastUpdated).not.toBe(oldDate);
        });

        test('returns 404 for non-existent collection', async () => {
            const response = await refreshChannel(deps, 'non-existent', 'some-channel');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Collection not found');
        });

        test('returns 404 for non-existent channel', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            const response = await refreshChannel(deps, collection.id, 'non-existent');
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Channel not found');
        });

        test('preserves enrichment data during refresh', async () => {
            const channelWithEnrichment = createMockStoredChannel({
                handle: '@TestChannel',
                data: {
                    channel: createMockChannelData().channel,
                    videos: [
                        {
                            videoId: 'video456',
                            title: 'Original Video',
                            thumbnail: 'https://i.ytimg.com/vi/video456/mqdefault.jpg',
                            duration: '5:00',
                            views: '500 views',
                            uploadedAt: '1 day ago',
                            isShort: false,
                            publishDate: '2024-02-01',
                            description: 'Original description',
                        },
                    ],
                } as any,
            });
            const collection = createMockCollection({ channels: [channelWithEnrichment] });
            deps.store = createInMemoryStore({ collections: [collection] });

            // Mock processor returns same video ID
            mockProcessor = createMockChannelProcessor({
                channelData: {
                    channel: createMockChannelData().channel,
                    videos: [
                        {
                            videoId: 'video456',
                            title: 'Updated Video Title',
                            thumbnail: 'https://i.ytimg.com/vi/video456/mqdefault.jpg',
                            duration: '5:00',
                            views: '1000 views',
                            uploadedAt: '2 days ago',
                            isShort: false,
                        },
                    ],
                },
            });
            deps.channelProcessor = mockProcessor;

            await refreshChannel(deps, collection.id, channelWithEnrichment.id);

            const storeData = await deps.store.load();
            const refreshedVideo = storeData.collections[0].channels[0].data?.videos[0];
            
            expect(refreshedVideo?.publishDate).toBe('2024-02-01');
            expect(refreshedVideo?.description).toBe('Original description');
        });

        test('persists refreshed data to store', async () => {
            const channel = createMockStoredChannel({ handle: '@TestChannel' });
            const collection = createMockCollection({ channels: [channel] });
            deps.store = createInMemoryStore({ collections: [collection] });

            await refreshChannel(deps, collection.id, channel.id);

            const storeData = await deps.store.load();
            expect(storeData.collections[0].channels[0].data).toBeDefined();
        });
    });

    describe('Integration scenarios', () => {
        test('add channel then list channels', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            await addChannel(deps, collection.id, { handle: '@NewChannel' });

            const listResponse = await listChannels(deps, collection.id);
            const channels = await listResponse.json();

            expect(channels).toHaveLength(1);
            expect(channels[0].handle).toBe('@NewChannel');
        });

        test('add, refresh, then delete channel', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            // Add
            const addResponse = await addChannel(deps, collection.id, { handle: '@TestChannel' });
            const { id: channelId } = await addResponse.json();

            // Refresh
            const refreshResponse = await refreshChannel(deps, collection.id, channelId);
            expect(refreshResponse.status).toBe(200);

            // Delete
            const deleteResponse = await deleteChannel(deps, collection.id, channelId);
            expect(deleteResponse.status).toBe(200);

            // Verify deleted
            const listResponse = await listChannels(deps, collection.id);
            const channels = await listResponse.json();
            expect(channels).toHaveLength(0);
        });

        test('multiple channels with different handles', async () => {
            const collection = createMockCollection({ channels: [] });
            deps.store = createInMemoryStore({ collections: [collection] });

            await addChannel(deps, collection.id, { handle: '@Channel1' });
            await addChannel(deps, collection.id, { handle: '@Channel2' });
            await addChannel(deps, collection.id, { handle: '@Channel3' });

            const listResponse = await listChannels(deps, collection.id);
            const channels = await listResponse.json();

            expect(channels).toHaveLength(3);
            expect(channels.map((c: any) => c.handle)).toEqual(['@Channel1', '@Channel2', '@Channel3']);
        });
    });
});
