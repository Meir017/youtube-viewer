/**
 * Test utilities and helpers for YouTube Viewer tests
 */

import type { Collection, StoredChannel } from '../../website/video-enrichment';
import type { WebChannelData } from '../../website/channel-processor';

/**
 * Creates a mock collection for testing
 */
export function createMockCollection(overrides: Partial<Collection> = {}): Collection {
    return {
        id: crypto.randomUUID(),
        name: 'Test Collection',
        channels: [],
        createdAt: new Date().toISOString(),
        ...overrides,
    };
}

/**
 * Creates a mock stored channel for testing
 */
export function createMockStoredChannel(overrides: Partial<StoredChannel> = {}): StoredChannel {
    return {
        id: crypto.randomUUID(),
        handle: '@TestChannel',
        addedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        ...overrides,
    };
}

/**
 * Creates a mock video for testing
 */
export function createMockVideo(overrides: Record<string, unknown> = {}) {
    return {
        videoId: `video_${crypto.randomUUID().slice(0, 8)}`,
        title: 'Test Video Title',
        thumbnail: 'https://i.ytimg.com/vi/test123/mqdefault.jpg',
        duration: '10:30',
        views: '1.2K views',
        uploadedAt: '3 days ago',
        isShort: false,
        ...overrides,
    };
}

/**
 * Creates a mock channel details object
 */
export function createMockChannelDetails(overrides: Record<string, unknown> = {}) {
    return {
        title: 'Test Channel',
        description: 'A test channel description',
        vanityUrl: '@TestChannel',
        channelUrl: 'https://youtube.com/@TestChannel',
        externalId: 'UC123456789',
        avatar: 'https://yt3.googleusercontent.com/avatar.jpg',
        subscriberCount: '100K',
        videoCount: '50',
        links: [],
        ...overrides,
    };
}

/**
 * Creates mock channel data for testing
 */
export function createMockChannelData(overrides: Partial<WebChannelData> = {}): WebChannelData {
    return {
        channel: createMockChannelDetails() as WebChannelData['channel'],
        videos: [createMockVideo()],
        ...overrides,
    };
}

/**
 * Creates a mock store for testing
 */
export function createMockStore(collections: Collection[] = []) {
    return {
        collections,
    };
}

/**
 * Wait for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a temporary test directory path
 */
export function getTempTestDir(): string {
    return `./tests/temp/${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Cleans up temporary test files and directories
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
    try {
        const { rm } = await import('fs/promises');
        await rm(dirPath, { recursive: true, force: true });
    } catch {
        // Ignore cleanup errors
    }
}

/**
 * Generate a random string for testing
 */
export function randomString(length: number = 8): string {
    let result = '';
    while (result.length < length) {
        result += Math.random().toString(36).substring(2);
    }
    return result.substring(0, length);
}

/**
 * Assert helper for checking response status and body
 */
export async function assertJsonResponse<T>(
    response: Response,
    expectedStatus: number
): Promise<T> {
    if (response.status !== expectedStatus) {
        const body = await response.text();
        throw new Error(
            `Expected status ${expectedStatus}, got ${response.status}. Body: ${body}`
        );
    }
    return response.json() as Promise<T>;
}

/**
 * Creates mock request object for testing route handlers
 */
export function createMockRequest(
    method: string,
    path: string,
    body?: unknown
): Request {
    const url = `http://localhost:3000${path}`;
    const init: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };
    
    if (body !== undefined) {
        init.body = JSON.stringify(body);
    }
    
    return new Request(url, init);
}
