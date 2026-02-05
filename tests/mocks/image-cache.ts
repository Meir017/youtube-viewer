// Mock Image Fetcher and Cache Storage for testing
// Returns configurable responses without making real network calls or file system access

import type { BunFile } from 'bun';
import type { ImageFetcher, ImageCacheStorage, FetchedImage } from '../../website/interfaces/image-fetcher';

/**
 * Configuration for the mock image fetcher.
 */
export interface MockImageFetcherConfig {
    /**
     * Map of URLs to image responses.
     */
    images?: Map<string, FetchedImage>;
    
    /**
     * Default image data for unmatched URLs.
     */
    defaultImage?: FetchedImage;
    
    /**
     * URLs that should fail with an error.
     */
    failUrls?: Set<string>;
    
    /**
     * If true, return null for unmatched URLs instead of default.
     */
    strictMode?: boolean;
}

/**
 * Creates a mock image fetcher for testing.
 */
export function createMockImageFetcher(config: MockImageFetcherConfig = {}): ImageFetcher & { 
    calls: string[];
    reset(): void;
} {
    const {
        images = new Map(),
        defaultImage = { data: new Blob(['test image data']), contentType: 'image/jpeg' },
        failUrls = new Set(),
        strictMode = false,
    } = config;
    
    const calls: string[] = [];
    
    return {
        calls,
        
        reset() {
            calls.length = 0;
        },
        
        async fetch(url: string): Promise<FetchedImage | null> {
            calls.push(url);
            
            if (failUrls.has(url)) {
                return null;
            }
            
            if (images.has(url)) {
                return images.get(url)!;
            }
            
            if (strictMode) {
                return null;
            }
            
            return defaultImage;
        },
    };
}

/**
 * Mock BunFile implementation for testing.
 */
export class MockBunFile implements Partial<BunFile> {
    private data: Blob;
    public readonly name: string;
    
    constructor(name: string, data: Blob | string = '') {
        this.name = name;
        this.data = typeof data === 'string' ? new Blob([data]) : data;
    }
    
    get size(): number {
        return this.data.size;
    }
    
    get type(): string {
        return this.data.type || 'image/jpeg';
    }
    
    async exists(): Promise<boolean> {
        return true;
    }
    
    async text(): Promise<string> {
        return this.data.text();
    }
    
    async arrayBuffer(): Promise<ArrayBuffer> {
        return this.data.arrayBuffer();
    }
}

/**
 * In-memory image cache storage for testing.
 */
export function createMockImageCacheStorage(): ImageCacheStorage & {
    files: Map<string, Blob>;
    reset(): void;
} {
    const files = new Map<string, Blob>();
    
    return {
        files,
        
        reset() {
            files.clear();
        },
        
        async exists(path: string): Promise<boolean> {
            return files.has(path);
        },
        
        async read(path: string): Promise<BunFile> {
            const data = files.get(path);
            if (!data) {
                throw new Error(`File not found: ${path}`);
            }
            return new MockBunFile(path, data) as unknown as BunFile;
        },
        
        async write(path: string, data: Blob | ArrayBuffer): Promise<void> {
            const blob = data instanceof Blob ? data : new Blob([data]);
            files.set(path, blob);
        },
        
        async delete(path: string): Promise<void> {
            files.delete(path);
        },
        
        async *list(pattern: string, dir: string): AsyncIterable<string> {
            // Simple pattern matching for *.jpg pattern
            const extension = pattern.replace('*', '');
            for (const path of files.keys()) {
                if (path.startsWith(dir) && path.endsWith(extension)) {
                    yield path.slice(dir.length + 1); // Remove dir prefix
                }
            }
        },
    };
}
