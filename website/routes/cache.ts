export interface ImageCacheService {
    getCacheStats(): Promise<{ fileCount: number; totalSize: number }>;
    clearCache(): Promise<number>;
}

export interface CacheHandlerDeps {
    imageCache: ImageCacheService;
}

/**
 * GET /api/cache/stats - Get cache statistics
 */
export async function getCacheStats(deps: CacheHandlerDeps): Promise<Response> {
    const stats = await deps.imageCache.getCacheStats();
    return Response.json(stats);
}

/**
 * DELETE /api/cache - Clear the image cache
 */
export async function clearCacheHandler(deps: CacheHandlerDeps): Promise<Response> {
    const count = await deps.imageCache.clearCache();
    return Response.json({ cleared: count });
}
