export interface CachedImageResult {
    // BunFile for cached files (efficient streaming), Blob for fresh fetches
    file: import('bun').BunFile | Blob | null;
    contentType: string;
    fromCache: boolean;
    error?: string;
}

export interface ImageService {
    getCachedImage(channelHandle: string, videoId: string, type: string): Promise<CachedImageResult>;
    getCachedAvatar(channelHandle: string, avatarUrl: string): Promise<CachedImageResult>;
}

export interface ImagesHandlerDeps {
    imageService: ImageService;
}

/**
 * GET /img/:channelHandle/:videoId/:type - Proxy and cache YouTube thumbnails
 * Example: /img/@GitHub/abc123xyz/mqdefault
 */
export async function getThumbnail(
    deps: ImagesHandlerDeps,
    channelHandle: string,
    videoId: string,
    type: string
): Promise<Response> {
    const result = await deps.imageService.getCachedImage(channelHandle, videoId, type);
    
    if (result.error || !result.file) {
        return new Response(result.error || 'Image not found', {
            status: 404,
            headers: {
                'Content-Type': 'text/plain',
                'Cache-Control': 'no-cache',
            },
        });
    }
    
    // Pass BunFile/Blob directly to Response for efficient streaming
    return new Response(result.file, {
        headers: {
            'Content-Type': result.contentType,
            'Cache-Control': 'public, max-age=86400', // Browser cache for 1 day
            'X-Cache': result.fromCache ? 'HIT' : 'MISS',
        },
    });
}

/**
 * GET /avatar/:channelHandle - Proxy and cache channel avatars
 * Example: /avatar/@GitHub?url=https://yt3.googleusercontent.com/...
 */
export async function getAvatar(
    deps: ImagesHandlerDeps,
    channelHandle: string,
    avatarUrl: string | null
): Promise<Response> {
    if (!avatarUrl) {
        return new Response('Missing avatar URL parameter', {
            status: 400,
            headers: { 'Content-Type': 'text/plain' },
        });
    }
    
    const result = await deps.imageService.getCachedAvatar(channelHandle, avatarUrl);
    
    if (result.error || !result.file) {
        return new Response(result.error || 'Avatar not found', {
            status: 404,
            headers: {
                'Content-Type': 'text/plain',
                'Cache-Control': 'no-cache',
            },
        });
    }
    
    // Pass BunFile/Blob directly to Response for efficient streaming
    return new Response(result.file, {
        headers: {
            'Content-Type': result.contentType,
            'Cache-Control': 'public, max-age=604800', // Browser cache for 1 week (avatars change rarely)
            'X-Cache': result.fromCache ? 'HIT' : 'MISS',
        },
    });
}
