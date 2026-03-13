import { describe, test, expect, beforeEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { DescriptionsHandlerDeps } from '../../../website/routes/descriptions';
import { getVideoDescription } from '../../../website/routes/descriptions';
import { createDescriptionsStore, type DescriptionsStoreInterface, type VideoDescriptions } from '../../../website/descriptions-store';
import { loadStore, type ChannelsStore } from '../../../website/store';
import {
    createMockChannelDetails,
    createMockCollection,
    createMockStoredChannel,
    createMockVideo,
} from '../../utils';

function createMockDescriptionsStore(initialDescriptions: VideoDescriptions = {}): DescriptionsStoreInterface {
    const descriptions = { ...initialDescriptions };

    return {
        async load() {
            return { ...descriptions };
        },
        async save(nextDescriptions) {
            Object.keys(descriptions).forEach((key) => delete descriptions[key]);
            Object.assign(descriptions, nextDescriptions);
        },
        async get(videoId) {
            return descriptions[videoId] ?? null;
        },
        async set(videoId, description) {
            descriptions[videoId] = description;
        },
    };
}

describe('Descriptions Routes', () => {
    let deps: DescriptionsHandlerDeps;

    beforeEach(() => {
        deps = {
            descriptionsStore: createMockDescriptionsStore({
                abc123: 'Loaded description',
            }),
        };
    });

    test('returns a stored description', async () => {
        const response = await getVideoDescription(deps, 'abc123');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({ description: 'Loaded description' });
    });

    test('returns null when description is missing', async () => {
        const response = await getVideoDescription(deps, 'missing-video');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({ description: null });
    });

    test('returns lazily loaded descriptions after store payloads are stripped', async () => {
        const tempDir = await mkdtemp(join(tmpdir(), 'descriptions-route-test-'));

        try {
            const channelsFile = join(tempDir, 'channels.json');
            const descriptionsStore = createDescriptionsStore(join(tempDir, 'descriptions.json'));
            const sourceStore: ChannelsStore = {
                collections: [createMockCollection({
                    channels: [createMockStoredChannel({
                        data: {
                            channel: createMockChannelDetails() as any,
                            videos: [createMockVideo({
                                videoId: 'lazy-video',
                                description: 'Loaded on demand',
                            })],
                        } as any,
                    })],
                })],
            };

            await Bun.write(channelsFile, JSON.stringify(sourceStore, null, 2));

            const strippedStore = await loadStore(channelsFile, descriptionsStore);
            expect(strippedStore.collections[0].channels[0].data?.videos[0].description).toBeUndefined();

            const response = await getVideoDescription({ descriptionsStore }, 'lazy-video');
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toEqual({ description: 'Loaded on demand' });
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });
});
