import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { buildStatic } from '../../website-tools/build-static';
import type { VideoDescriptions } from '../../website/descriptions-store';
import type { ChannelsStore } from '../../website/store';
import {
    createMockChannelDetails,
    createMockCollection,
    createMockStoredChannel,
    createMockVideo,
} from '../utils';

describe('build-static', () => {
    let tempDir: string;
    let sourceStore: ChannelsStore;
    let sourceDescriptions: VideoDescriptions;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'build-static-test-'));
        sourceStore = {
            collections: [createMockCollection({
                id: 'tech',
                name: 'Tech',
                createdAt: '2024-01-01T00:00:00.000Z',
                channels: [createMockStoredChannel({
                    handle: '@GitHub',
                    data: {
                        channel: createMockChannelDetails({
                            vanityUrl: '@GitHub',
                            subscriberCount: '1M subscribers',
                            keywords: 'github, code',
                            links: [{ title: 'Website', url: 'https://github.com' }],
                            aboutContinuationToken: 'about-token',
                        }) as any,
                        videos: [
                            createMockVideo({ videoId: 'video-1', description: 'Inline description' }),
                            createMockVideo({ videoId: 'video-2', description: undefined }),
                        ],
                    } as any,
                })],
            })],
        };
        sourceDescriptions = {
            'existing-video': 'Existing description',
        };
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    test('copies all required files to output directory', async () => {
        const copied = await buildStatic(tempDir, {
            store: sourceStore,
            descriptions: sourceDescriptions,
        });

        expect(copied).toHaveLength(sourceStore.collections.length + 5);
        expect(copied.map(f => f.name)).toEqual([
            'index.html',
            'styles.css',
            'app.js',
            'data/index.json',
            'data/collection-tech.json',
            'data/descriptions.json',
        ]);
    });

    test('writes split output files and does not create a monolithic channels.json', async () => {
        await buildStatic(tempDir, {
            store: sourceStore,
            descriptions: sourceDescriptions,
        });

        expect(await Bun.file(join(tempDir, 'index.html')).exists()).toBe(true);
        expect(await Bun.file(join(tempDir, 'app.js')).exists()).toBe(true);
        expect(await Bun.file(join(tempDir, 'styles.css')).exists()).toBe(true);
        expect(await Bun.file(join(tempDir, 'data', 'index.json')).exists()).toBe(true);
        expect(await Bun.file(join(tempDir, 'data', 'collection-tech.json')).exists()).toBe(true);
        expect(await Bun.file(join(tempDir, 'data', 'descriptions.json')).exists()).toBe(true);
        expect(await Bun.file(join(tempDir, 'data', 'channels.json')).exists()).toBe(false);
    });

    test('writes metadata-only index.json output', async () => {
        await buildStatic(tempDir, {
            store: sourceStore,
            descriptions: sourceDescriptions,
        });

        const data = await Bun.file(join(tempDir, 'data', 'index.json')).json() as {
            collections: Array<{ id: string; name: string; channelCount: number; channels?: unknown }>;
        };

        expect(data.collections).toEqual([{
            id: 'tech',
            name: 'Tech',
            channelCount: 1,
        }]);
        expect(data.collections[0].channels).toBeUndefined();
    });

    test('omits per-video descriptions from collection payloads', async () => {
        await buildStatic(tempDir, {
            store: sourceStore,
            descriptions: sourceDescriptions,
        });

        const data = await Bun.file(join(tempDir, 'data', 'collection-tech.json')).json() as {
            channels: Array<{ data?: { videos?: Array<{ videoId: string; description?: string }> } }>;
        };

        expect(data.channels[0].data?.videos).toEqual([
            expect.objectContaining({ videoId: 'video-1' }),
            expect.objectContaining({ videoId: 'video-2' }),
        ]);
        for (const video of data.channels[0].data?.videos || []) {
            expect(video.description).toBeUndefined();
        }
    });

    test('writes descriptions.json with extracted and existing descriptions', async () => {
        await buildStatic(tempDir, {
            store: sourceStore,
            descriptions: sourceDescriptions,
        });

        const descriptions = await Bun.file(join(tempDir, 'data', 'descriptions.json')).json() as VideoDescriptions;

        expect(descriptions).toEqual({
            'existing-video': 'Existing description',
            'video-1': 'Inline description',
        });
    });

    test('strips unused channel metadata while preserving title and avatar', async () => {
        await buildStatic(tempDir, {
            store: sourceStore,
            descriptions: sourceDescriptions,
        });

        const data = await Bun.file(join(tempDir, 'data', 'collection-tech.json')).json() as any;
        const storedChannel = data.channels[0];

        expect(storedChannel.data.channel).toEqual({
            title: 'Test Channel',
            description: 'A test channel description',
            avatar: 'https://yt3.googleusercontent.com/avatar.jpg',
        });
        expect(Object.keys(storedChannel.data.channel).sort()).toEqual(['avatar', 'description', 'title']);
    });

    test('copied files have non-zero sizes and static app stays API-free', async () => {
        const copied = await buildStatic(tempDir, {
            store: sourceStore,
            descriptions: sourceDescriptions,
        });

        expect(copied.every(file => file.size > 0)).toBe(true);
        expect(await Bun.file(join(tempDir, 'index.html')).text()).toContain('app.js');
        expect(await Bun.file(join(tempDir, 'index.html')).text()).toContain('styles.css');
        expect(await Bun.file(join(tempDir, 'app.js')).text()).not.toContain('/api/');
    });
});
