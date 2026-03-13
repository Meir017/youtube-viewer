import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDescriptionsStore } from '../../website/descriptions-store';
import { loadStore, saveStore, type ChannelsStore } from '../../website/store';
import {
    createMockChannelDetails,
    createMockCollection,
    createMockStoredChannel,
    createMockVideo,
} from '../utils';

describe('File-backed store persistence', () => {
    let tempDir: string;
    let channelsPath: string;
    let descriptionsPath: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'store-persistence-test-'));
        channelsPath = join(tempDir, 'channels.json');
        descriptionsPath = join(tempDir, 'descriptions.json');
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    function createStoreWithDescriptions(): ChannelsStore {
        return {
            collections: [createMockCollection({
                channels: [createMockStoredChannel({
                    data: {
                        channel: createMockChannelDetails() as any,
                        videos: [
                            createMockVideo({ videoId: 'video-1', description: 'Inline description' }),
                            createMockVideo({ videoId: 'video-2' }),
                        ],
                    } as any,
                })],
            })],
        };
    }

    test('saveStore strips descriptions from persisted channel payloads', async () => {
        const descriptionsStore = createDescriptionsStore(descriptionsPath);
        const store = createStoreWithDescriptions();

        await saveStore(store, channelsPath, descriptionsStore);

        const savedStore = await Bun.file(channelsPath).json() as ChannelsStore;

        expect(savedStore.collections[0].channels[0].data?.videos[0].description).toBeUndefined();
        expect(await descriptionsStore.load()).toEqual({
            'video-1': 'Inline description',
        });
        expect(store.collections[0].channels[0].data?.videos[0].description).toBe('Inline description');
    });

    test('loadStore strips inline descriptions and rewrites the stored payload', async () => {
        const descriptionsStore = createDescriptionsStore(descriptionsPath);
        const store = createStoreWithDescriptions();

        await Bun.write(channelsPath, JSON.stringify(store, null, 2));

        const loadedStore = await loadStore(channelsPath, descriptionsStore);
        const rewrittenStore = await Bun.file(channelsPath).json() as ChannelsStore;

        expect(loadedStore.collections[0].channels[0].data?.videos[0].description).toBeUndefined();
        expect(rewrittenStore.collections[0].channels[0].data?.videos[0].description).toBeUndefined();
        expect(await descriptionsStore.get('video-1')).toBe('Inline description');
    });
});
