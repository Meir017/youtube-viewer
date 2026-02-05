// Image caching proxy for YouTube thumbnails
import { join } from 'path';
import type { BunFile } from 'bun';
import type { ImageFetcher, ImageCacheStorage } from './interfaces/image-fetcher';
import { createImageFetcher, createImageCacheStorage } from './interfaces/image-fetcher';

const CACHE_DIR = join(import.meta.dir, 'cache', 'images');

/**
 * Dependencies for image cache operations.
 * Allows injection of mock implementations for testing.
 */
export interface ImageCacheDeps {
    fetcher?: ImageFetcher;
    storage?: ImageCacheStorage;
    cacheDir?: string;
}

// Default implementations
const defaultDeps: Required<ImageCacheDeps> = {
    fetcher: createImageFetcher(),
    storage: createImageCacheStorage(),
    cacheDir: CACHE_DIR,
};

// Ensure cache directory exists
async function ensureCacheDir(storage: ImageCacheStorage, cacheDir: string): Promise<void> {
    const gitkeepPath = join(cacheDir, '.gitkeep');
    if (!(await storage.exists(gitkeepPath))) {
        await storage.write(gitkeepPath, new Blob(['']));
    }
}

// Sanitize channel handle for use in filename (remove @ and special chars)
export function sanitizeHandle(handle: string): string {
    return handle.replace(/^@/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Get cache file path for a video thumbnail
function getCachePath(cacheDir: string, channelHandle: string, videoId: string, type: string): string {
    const sanitizedHandle = sanitizeHandle(channelHandle);
    const extension = type.includes('.') ? '' : '.jpg';
    return join(cacheDir, `${sanitizedHandle}_${videoId}_${type}${extension}`);
}

// Get cache file path for a channel avatar
function getAvatarCachePath(cacheDir: string, channelHandle: string): string {
    const sanitizedHandle = sanitizeHandle(channelHandle);
    return join(cacheDir, `${sanitizedHandle}_avatar.jpg`);
}

// YouTube thumbnail URL patterns
const THUMBNAIL_URLS: Record<string, string> = {
    'mqdefault': 'https://i.ytimg.com/vi/{videoId}/mqdefault.jpg',
    'hqdefault': 'https://i.ytimg.com/vi/{videoId}/hqdefault.jpg',
    'sddefault': 'https://i.ytimg.com/vi/{videoId}/sddefault.jpg',
    'maxresdefault': 'https://i.ytimg.com/vi/{videoId}/maxresdefault.jpg',
    'oar2': 'https://i.ytimg.com/vi/{videoId}/oar2.jpg', // Shorts thumbnail
};

function getYouTubeUrl(videoId: string, type: string): string | null {
    const template = THUMBNAIL_URLS[type];
    if (!template) return null;
    return template.replace('{videoId}', videoId);
}

export interface CacheResult {
    // BunFile for cached files (efficient streaming), Blob for fresh fetches
    file: BunFile | Blob | null;
    contentType: string;
    fromCache: boolean;
    error?: string;
}

// Fetch and cache an image, or return from cache if available
export async function getCachedImage(
    channelHandle: string,
    videoId: string,
    type: string,
    deps: ImageCacheDeps = {}
): Promise<CacheResult> {
    const { fetcher = defaultDeps.fetcher, storage = defaultDeps.storage, cacheDir = defaultDeps.cacheDir } = deps;
    
    await ensureCacheDir(storage, cacheDir);
    
    const cachePath = getCachePath(cacheDir, channelHandle, videoId, type);
    
    // Try to serve from cache
    if (await storage.exists(cachePath)) {
        const cacheFile = await storage.read(cachePath);
        return {
            file: cacheFile,
            contentType: cacheFile.type || 'image/jpeg',
            fromCache: true,
        };
    }
    
    // Fetch from YouTube
    const youtubeUrl = getYouTubeUrl(videoId, type);
    if (!youtubeUrl) {
        return {
            file: null,
            contentType: 'image/jpeg',
            fromCache: false,
            error: `Unknown thumbnail type: ${type}`,
        };
    }
    
    console.log(`Fetching image: ${youtubeUrl}`);
    const result = await fetcher.fetch(youtubeUrl);
    
    if (!result) {
        return {
            file: null,
            contentType: 'image/jpeg',
            fromCache: false,
            error: 'Failed to fetch image from YouTube',
        };
    }
    
    // Save to cache asynchronously (fire and forget for faster response)
    storage.write(cachePath, result.data)
        .then(() => console.log(`Cached: ${cachePath}`))
        .catch((e) => console.error(`Cache write error for ${cachePath}:`, e));
    
    return {
        file: result.data instanceof Blob ? result.data : new Blob([result.data]),
        contentType: result.contentType,
        fromCache: false,
    };
}

// Fetch and cache a channel avatar, or return from cache if available
export async function getCachedAvatar(
    channelHandle: string,
    avatarUrl: string,
    deps: ImageCacheDeps = {}
): Promise<CacheResult> {
    const { fetcher = defaultDeps.fetcher, storage = defaultDeps.storage, cacheDir = defaultDeps.cacheDir } = deps;
    
    await ensureCacheDir(storage, cacheDir);
    
    const cachePath = getAvatarCachePath(cacheDir, channelHandle);
    
    // Try to serve from cache
    if (await storage.exists(cachePath)) {
        const cacheFile = await storage.read(cachePath);
        return {
            file: cacheFile,
            contentType: cacheFile.type || 'image/jpeg',
            fromCache: true,
        };
    }
    
    // Validate the avatar URL is from YouTube
    if (!avatarUrl.includes('yt3.googleusercontent.com') && !avatarUrl.includes('yt3.ggpht.com')) {
        return {
            file: null,
            contentType: 'image/jpeg',
            fromCache: false,
            error: 'Invalid avatar URL',
        };
    }
    
    console.log(`Fetching avatar: ${avatarUrl}`);
    const result = await fetcher.fetch(avatarUrl);
    
    if (!result) {
        return {
            file: null,
            contentType: 'image/jpeg',
            fromCache: false,
            error: 'Failed to fetch avatar from YouTube',
        };
    }
    
    // Save to cache asynchronously (fire and forget for faster response)
    storage.write(cachePath, result.data)
        .then(() => console.log(`Cached avatar: ${cachePath}`))
        .catch((e) => console.error(`Avatar cache write error for ${cachePath}:`, e));
    
    return {
        file: result.data instanceof Blob ? result.data : new Blob([result.data]),
        contentType: result.contentType,
        fromCache: false,
    };
}

// Clear cache
export async function clearCache(deps: ImageCacheDeps = {}): Promise<number> {
    const { storage = defaultDeps.storage, cacheDir = defaultDeps.cacheDir } = deps;
    
    let count = 0;
    
    for await (const file of storage.list('*.jpg', cacheDir)) {
        const path = join(cacheDir, file);
        try {
            await storage.delete(path);
            count++;
        } catch (e) {
            // Ignore errors (file may have been deleted)
        }
    }
    
    return count;
}

// Get cache stats (optional utility)
export async function getCacheStats(deps: ImageCacheDeps = {}): Promise<{ fileCount: number; totalSize: number }> {
    const { storage = defaultDeps.storage, cacheDir = defaultDeps.cacheDir } = deps;
    
    let fileCount = 0;
    let totalSize = 0;
    
    for await (const file of storage.list('*.jpg', cacheDir)) {
        const path = join(cacheDir, file);
        try {
            if (await storage.exists(path)) {
                const f = await storage.read(path);
                fileCount++;
                totalSize += f.size;
            }
        } catch (e) {
            // Ignore errors
        }
    }
    
    return { fileCount, totalSize };
}
