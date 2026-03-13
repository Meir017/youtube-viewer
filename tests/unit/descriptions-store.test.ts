import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDescriptionsStore } from '../../website/descriptions-store';

describe('Descriptions Store', () => {
    let tempDir: string;
    let storePath: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'descriptions-store-test-'));
        storePath = join(tempDir, 'descriptions.json');
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    test('loads an empty descriptions map when the file does not exist', async () => {
        const store = createDescriptionsStore(storePath);

        expect(await store.load()).toEqual({});
        expect(await store.get('missing-video')).toBeNull();
    });

    test('persists descriptions through set and load', async () => {
        const store = createDescriptionsStore(storePath);

        await store.set('video-1', 'Description 1');
        await store.set('video-2', 'Description 2');

        expect(await store.get('video-1')).toBe('Description 1');
        expect(await store.load()).toEqual({
            'video-1': 'Description 1',
            'video-2': 'Description 2',
        });
    });

    test('save overwrites the stored description map', async () => {
        const store = createDescriptionsStore(storePath);

        await store.set('video-1', 'Old description');
        await store.save({ 'video-2': 'Fresh description' });

        expect(await store.load()).toEqual({ 'video-2': 'Fresh description' });
        expect(await store.get('video-1')).toBeNull();
        expect(await store.get('video-2')).toBe('Fresh description');
    });
});
