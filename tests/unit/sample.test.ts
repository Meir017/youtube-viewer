/**
 * Sample unit tests to verify the test infrastructure setup
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
    createMockCollection,
    createMockStoredChannel,
    createMockVideo,
    createMockChannelData,
    createMockStore,
    randomString,
    createMockRequest,
} from '../utils';

describe('Test Utils', () => {
    describe('createMockCollection', () => {
        test('creates a collection with default values', () => {
            const collection = createMockCollection();
            
            expect(collection.id).toBeDefined();
            expect(collection.name).toBe('Test Collection');
            expect(collection.channels).toEqual([]);
            expect(collection.createdAt).toBeDefined();
        });

        test('allows overriding default values', () => {
            const collection = createMockCollection({
                name: 'Custom Collection',
                channels: [createMockStoredChannel()],
            });
            
            expect(collection.name).toBe('Custom Collection');
            expect(collection.channels.length).toBe(1);
        });
    });

    describe('createMockStoredChannel', () => {
        test('creates a channel with default values', () => {
            const channel = createMockStoredChannel();
            
            expect(channel.id).toBeDefined();
            expect(channel.handle).toBe('@TestChannel');
            expect(channel.addedAt).toBeDefined();
            expect(channel.lastUpdated).toBeDefined();
        });

        test('allows overriding handle', () => {
            const channel = createMockStoredChannel({ handle: '@CustomChannel' });
            
            expect(channel.handle).toBe('@CustomChannel');
        });
    });

    describe('createMockVideo', () => {
        test('creates a video with default values', () => {
            const video = createMockVideo();
            
            expect(video.videoId).toBeDefined();
            expect(video.title).toBe('Test Video Title');
            expect(video.duration).toBe('10:30');
            expect(video.isShort).toBe(false);
        });

        test('allows creating a short', () => {
            const short = createMockVideo({ isShort: true, duration: '0:30' });
            
            expect(short.isShort).toBe(true);
            expect(short.duration).toBe('0:30');
        });
    });

    describe('createMockChannelData', () => {
        test('creates channel data with default values', () => {
            const data = createMockChannelData();
            
            expect(data.channel).toBeDefined();
            expect(data.channel.title).toBe('Test Channel');
            expect(data.videos.length).toBeGreaterThan(0);
        });
    });

    describe('createMockStore', () => {
        test('creates empty store by default', () => {
            const store = createMockStore();
            
            expect(store.collections).toEqual([]);
        });

        test('creates store with provided collections', () => {
            const collections = [createMockCollection()];
            const store = createMockStore(collections);
            
            expect(store.collections.length).toBe(1);
        });
    });

    describe('randomString', () => {
        test('generates string of default length', () => {
            const str = randomString();
            
            expect(str.length).toBe(8);
        });

        test('generates string of specified length', () => {
            const str = randomString(16);
            
            expect(str.length).toBe(16);
        });

        test('generates unique strings', () => {
            const str1 = randomString();
            const str2 = randomString();
            
            expect(str1).not.toBe(str2);
        });
    });

    describe('createMockRequest', () => {
        test('creates GET request', () => {
            const req = createMockRequest('GET', '/api/collections');
            
            expect(req.method).toBe('GET');
            expect(req.url).toBe('http://localhost:3000/api/collections');
        });

        test('creates POST request with body', () => {
            const req = createMockRequest('POST', '/api/collections', { name: 'Test' });
            
            expect(req.method).toBe('POST');
            expect(req.headers.get('Content-Type')).toBe('application/json');
        });
    });
});

describe('Bun Test Runner Verification', () => {
    test('basic assertions work', () => {
        expect(1 + 1).toBe(2);
        expect('hello').toContain('ell');
        expect([1, 2, 3]).toHaveLength(3);
        expect({ a: 1 }).toHaveProperty('a');
    });

    test('async tests work', async () => {
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        await delay(10);
        expect(true).toBe(true);
    });

    test('exception testing works', () => {
        expect(() => {
            throw new Error('test error');
        }).toThrow('test error');
    });
});
