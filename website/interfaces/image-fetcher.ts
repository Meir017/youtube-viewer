// Interface for image fetching operations
// Allows mocking in tests without making real network calls or file system access

import type { BunFile } from 'bun';

export interface FetchedImage {
    data: Blob | ArrayBuffer;
    contentType: string;
}

/**
 * Interface for fetching images from remote URLs.
 */
export interface ImageFetcher {
    /**
     * Fetch an image from a URL.
     * @param url The URL to fetch
     * @returns The image data and content type, or null if fetch failed
     */
    fetch(url: string): Promise<FetchedImage | null>;
}

/**
 * Interface for caching images to file system.
 */
export interface ImageCacheStorage {
    /**
     * Check if a cached file exists.
     */
    exists(path: string): Promise<boolean>;
    
    /**
     * Read a cached file.
     */
    read(path: string): Promise<BunFile>;
    
    /**
     * Write data to cache.
     */
    write(path: string, data: Blob | ArrayBuffer): Promise<void>;
    
    /**
     * Delete a cached file.
     */
    delete(path: string): Promise<void>;
    
    /**
     * List files matching a pattern.
     */
    list(pattern: string, dir: string): AsyncIterable<string>;
}

/**
 * Create the real image fetcher implementation using native fetch.
 */
export function createImageFetcher(): ImageFetcher {
    return {
        async fetch(url: string): Promise<FetchedImage | null> {
            try {
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                });
                
                if (!response.ok) {
                    console.error(`Image fetch failed: ${response.status} for ${url}`);
                    return null;
                }
                
                const contentType = response.headers.get('content-type') || 'image/jpeg';
                const data = await response.blob();
                
                return { data, contentType };
            } catch (e: any) {
                console.error(`Image fetch error for ${url}:`, e.message);
                return null;
            }
        },
    };
}

/**
 * Create the real image cache storage implementation using Bun file system.
 */
export function createImageCacheStorage(): ImageCacheStorage {
    return {
        async exists(path: string): Promise<boolean> {
            return Bun.file(path).exists();
        },
        
        async read(path: string): Promise<BunFile> {
            return Bun.file(path);
        },
        
        async write(path: string, data: Blob | ArrayBuffer): Promise<void> {
            await Bun.write(path, data);
        },
        
        async delete(path: string): Promise<void> {
            const { unlink } = await import('fs/promises');
            await unlink(path);
        },
        
        async *list(pattern: string, dir: string): AsyncIterable<string> {
            const glob = new Bun.Glob(pattern);
            for await (const file of glob.scan(dir)) {
                yield file;
            }
        },
    };
}
