// Image caching proxy for YouTube thumbnails
import { join } from 'path';
import { unlink } from 'fs/promises';
import type { BunFile } from 'bun';

const CACHE_DIR = join(import.meta.dir, 'cache', 'images');

// Ensure cache directory exists
async function ensureCacheDir(): Promise<void> {
    const dir = Bun.file(join(CACHE_DIR, '.gitkeep'));
    if (!(await dir.exists())) {
        await Bun.write(join(CACHE_DIR, '.gitkeep'), '');
    }
}

// Sanitize channel handle for use in filename (remove @ and special chars)
function sanitizeHandle(handle: string): string {
    return handle.replace(/^@/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Get cache file path for a video thumbnail
function getCachePath(channelHandle: string, videoId: string, type: string): string {
    const sanitizedHandle = sanitizeHandle(channelHandle);
    const extension = type.includes('.') ? '' : '.jpg';
    return join(CACHE_DIR, `${sanitizedHandle}_${videoId}_${type}${extension}`);
}

// Get cache file path for a channel avatar
function getAvatarCachePath(channelHandle: string): string {
    const sanitizedHandle = sanitizeHandle(channelHandle);
    return join(CACHE_DIR, `${sanitizedHandle}_avatar.jpg`);
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
    type: string
): Promise<CacheResult> {
    await ensureCacheDir();
    
    const cachePath = getCachePath(channelHandle, videoId, type);
    const cacheFile = Bun.file(cachePath);
    
    // Try to serve from cache - return BunFile directly for efficient streaming
    if (await cacheFile.exists()) {
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
    
    try {
        console.log(`Fetching image: ${youtubeUrl}`);
        const response = await fetch(youtubeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });
        
        if (!response.ok) {
            return {
                file: null,
                contentType: 'image/jpeg',
                fromCache: false,
                error: `YouTube returned ${response.status}`,
            };
        }
        
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        
        // Get response as blob for both caching and returning
        const blob = await response.blob();
        
        // Save to cache asynchronously (fire and forget for faster response)
        Bun.write(cachePath, blob)
            .then(() => console.log(`Cached: ${cachePath}`))
            .catch((e) => console.error(`Cache write error for ${cachePath}:`, e));
        
        return {
            file: blob,
            contentType,
            fromCache: false,
        };
    } catch (e: any) {
        console.error(`Fetch error for ${youtubeUrl}:`, e);
        return {
            file: null,
            contentType: 'image/jpeg',
            fromCache: false,
            error: e.message || 'Failed to fetch image',
        };
    }
}

// Fetch and cache a channel avatar, or return from cache if available
export async function getCachedAvatar(
    channelHandle: string,
    avatarUrl: string
): Promise<CacheResult> {
    await ensureCacheDir();
    
    const cachePath = getAvatarCachePath(channelHandle);
    const cacheFile = Bun.file(cachePath);
    
    // Try to serve from cache - return BunFile directly for efficient streaming
    if (await cacheFile.exists()) {
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
    
    try {
        console.log(`Fetching avatar: ${avatarUrl}`);
        const response = await fetch(avatarUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });
        
        if (!response.ok) {
            return {
                file: null,
                contentType: 'image/jpeg',
                fromCache: false,
                error: `YouTube returned ${response.status}`,
            };
        }
        
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        
        // Get response as blob for both caching and returning
        const blob = await response.blob();
        
        // Save to cache asynchronously (fire and forget for faster response)
        Bun.write(cachePath, blob)
            .then(() => console.log(`Cached avatar: ${cachePath}`))
            .catch((e) => console.error(`Avatar cache write error for ${cachePath}:`, e));
        
        return {
            file: blob,
            contentType,
            fromCache: false,
        };
    } catch (e: any) {
        console.error(`Avatar fetch error for ${avatarUrl}:`, e);
        return {
            file: null,
            contentType: 'image/jpeg',
            fromCache: false,
            error: e.message || 'Failed to fetch avatar',
        };
    }
}

// Clear cache
export async function clearCache(): Promise<number> {
    const glob = new Bun.Glob('*.jpg');
    let count = 0;
    
    for await (const file of glob.scan(CACHE_DIR)) {
        const path = join(CACHE_DIR, file);
        try {
            await unlink(path);
            count++;
        } catch (e) {
            // Ignore errors (file may have been deleted)
        }
    }
    
    return count;
}

// Get cache stats (optional utility)
export async function getCacheStats(): Promise<{ fileCount: number; totalSize: number }> {
    const glob = new Bun.Glob('*.jpg');
    let fileCount = 0;
    let totalSize = 0;
    
    for await (const file of glob.scan(CACHE_DIR)) {
        const path = join(CACHE_DIR, file);
        try {
            const f = Bun.file(path);
            if (await f.exists()) {
                fileCount++;
                totalSize += f.size;
            }
        } catch (e) {
            // Ignore errors
        }
    }
    
    return { fileCount, totalSize };
}
