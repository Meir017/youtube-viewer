import { join } from 'path';
import { processChannelForWeb } from './channel-processor';
import { getCachedImage, getCachedAvatar, getCacheStats, clearCache } from './image-cache';
import { getEnrichmentStatus, startEnrichment } from './video-enrichment';
import { createStore, ensureDataDir, type StoreInterface } from './store';

// Route handlers
import * as collectionsRoutes from './routes/collections';
import * as channelsRoutes from './routes/channels';
import * as enrichmentRoutes from './routes/enrichment';
import * as hiddenRoutes from './routes/hidden';
import * as cacheRoutes from './routes/cache';
import * as imagesRoutes from './routes/images';

const PUBLIC_DIR = join(import.meta.dir, 'public');

// Create dependencies
const store: StoreInterface = createStore();

const channelProcessor: channelsRoutes.ChannelProcessor = {
    processChannelForWeb,
};

const enrichmentService: enrichmentRoutes.EnrichmentService = {
    getEnrichmentStatus,
    startEnrichment,
};

const imageService: imagesRoutes.ImageService = {
    getCachedImage,
    getCachedAvatar,
};

const imageCacheService: cacheRoutes.ImageCacheService = {
    getCacheStats,
    clearCache,
};

// Create handler dependencies
const collectionsDeps: collectionsRoutes.CollectionsHandlerDeps = { store };
const channelsDeps: channelsRoutes.ChannelsHandlerDeps = { store, channelProcessor };
const enrichmentDeps: enrichmentRoutes.EnrichmentHandlerDeps = { store, enrichmentService };
const hiddenDeps: hiddenRoutes.HiddenHandlerDeps = { store };
const cacheDeps: cacheRoutes.CacheHandlerDeps = { imageCache: imageCacheService };
const imagesDeps: imagesRoutes.ImagesHandlerDeps = { imageService };

// CORS headers for API responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Add CORS headers to a response
 */
function withCors(response: Response): Response {
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
    });
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

/**
 * Wrap handler execution with error handling
 */
async function handleApiRequest(
    handler: () => Promise<Response>
): Promise<Response> {
    try {
        const response = await handler();
        return withCors(response);
    } catch (e: any) {
        console.error('API Error:', e);
        return withCors(
            Response.json({ error: e.message || 'Internal server error' }, { status: 500 })
        );
    }
}

const server = Bun.serve({
    port: 3000,
    async fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;

        // API Routes
        if (path.startsWith('/api/')) {
            if (req.method === 'OPTIONS') {
                return new Response(null, { headers: corsHeaders });
            }

            // ==================== COLLECTIONS API ====================
            
            // GET /api/collections - List all collections
            if (path === '/api/collections' && req.method === 'GET') {
                return handleApiRequest(() => 
                    collectionsRoutes.listCollections(collectionsDeps)
                );
            }

            // POST /api/collections - Create a new collection
            if (path === '/api/collections' && req.method === 'POST') {
                return handleApiRequest(async () => {
                    const body = await req.json() as { name: string };
                    return collectionsRoutes.createCollection(collectionsDeps, body);
                });
            }

            // PUT /api/collections/:id - Update collection name
            const updateCollectionMatch = path.match(/^\/api\/collections\/([^/]+)$/);
            if (updateCollectionMatch && req.method === 'PUT') {
                return handleApiRequest(async () => {
                    const id = updateCollectionMatch[1];
                    const body = await req.json() as { name: string };
                    return collectionsRoutes.updateCollection(collectionsDeps, id, body);
                });
            }

            // DELETE /api/collections/:id - Delete a collection
            const deleteCollectionMatch = path.match(/^\/api\/collections\/([^/]+)$/);
            if (deleteCollectionMatch && req.method === 'DELETE') {
                return handleApiRequest(() => {
                    const id = deleteCollectionMatch[1];
                    return collectionsRoutes.deleteCollection(collectionsDeps, id);
                });
            }

            // ==================== CHANNELS WITHIN COLLECTIONS API ====================
            
            // GET /api/collections/:collectionId/channels - List channels in collection
            const listChannelsMatch = path.match(/^\/api\/collections\/([^/]+)\/channels$/);
            if (listChannelsMatch && req.method === 'GET') {
                return handleApiRequest(() => {
                    const collectionId = listChannelsMatch[1];
                    const maxAgeDaysParam = url.searchParams.get('maxAgeDays');
                    const maxAgeDays = maxAgeDaysParam ? parseInt(maxAgeDaysParam) || 30 : undefined;
                    return channelsRoutes.listChannels(channelsDeps, collectionId, maxAgeDays);
                });
            }

            // POST /api/collections/:collectionId/channels - Add a channel to collection
            const addChannelMatch = path.match(/^\/api\/collections\/([^/]+)\/channels$/);
            if (addChannelMatch && req.method === 'POST') {
                return handleApiRequest(async () => {
                    const collectionId = addChannelMatch[1];
                    const body = await req.json() as { handle: string };
                    return channelsRoutes.addChannel(channelsDeps, collectionId, body);
                });
            }

            // DELETE /api/collections/:collectionId/channels/:channelId - Remove a channel
            const deleteChannelMatch = path.match(/^\/api\/collections\/([^/]+)\/channels\/([^/]+)$/);
            if (deleteChannelMatch && req.method === 'DELETE') {
                return handleApiRequest(() => {
                    const collectionId = deleteChannelMatch[1];
                    const channelId = deleteChannelMatch[2];
                    return channelsRoutes.deleteChannel(channelsDeps, collectionId, channelId);
                });
            }

            // POST /api/collections/:collectionId/channels/:channelId/refresh - Refresh channel
            const refreshChannelMatch = path.match(/^\/api\/collections\/([^/]+)\/channels\/([^/]+)\/refresh$/);
            if (refreshChannelMatch && req.method === 'POST') {
                return handleApiRequest(() => {
                    const collectionId = refreshChannelMatch[1];
                    const channelId = refreshChannelMatch[2];
                    return channelsRoutes.refreshChannel(channelsDeps, collectionId, channelId);
                });
            }

            // ==================== ENRICHMENT API ====================

            // GET /api/collections/:collectionId/enrich/status - Get enrichment status
            const enrichStatusMatch = path.match(/^\/api\/collections\/([^/]+)\/enrich\/status$/);
            if (enrichStatusMatch && req.method === 'GET') {
                return handleApiRequest(() => {
                    const collectionId = enrichStatusMatch[1];
                    return enrichmentRoutes.getEnrichmentStatusHandler(enrichmentDeps, collectionId);
                });
            }

            // POST /api/collections/:collectionId/enrich - Start enrichment job
            const enrichMatch = path.match(/^\/api\/collections\/([^/]+)\/enrich$/);
            if (enrichMatch && req.method === 'POST') {
                return handleApiRequest(() => {
                    const collectionId = enrichMatch[1];
                    return enrichmentRoutes.startEnrichmentHandler(enrichmentDeps, collectionId);
                });
            }

            // ==================== HIDDEN VIDEOS API ====================

            // GET /api/collections/:collectionId/hidden - Get hidden video IDs
            const getHiddenMatch = path.match(/^\/api\/collections\/([^/]+)\/hidden$/);
            if (getHiddenMatch && req.method === 'GET') {
                return handleApiRequest(() => {
                    const collectionId = getHiddenMatch[1];
                    return hiddenRoutes.getHiddenVideos(hiddenDeps, collectionId);
                });
            }

            // POST /api/collections/:collectionId/hidden/:videoId - Hide a video
            const hideVideoMatch = path.match(/^\/api\/collections\/([^/]+)\/hidden\/([^/]+)$/);
            if (hideVideoMatch && req.method === 'POST') {
                return handleApiRequest(() => {
                    const collectionId = hideVideoMatch[1];
                    const videoId = hideVideoMatch[2];
                    return hiddenRoutes.hideVideo(hiddenDeps, collectionId, videoId);
                });
            }

            // DELETE /api/collections/:collectionId/hidden/:videoId - Unhide a video
            const unhideVideoMatch = path.match(/^\/api\/collections\/([^/]+)\/hidden\/([^/]+)$/);
            if (unhideVideoMatch && req.method === 'DELETE') {
                return handleApiRequest(() => {
                    const collectionId = unhideVideoMatch[1];
                    const videoId = unhideVideoMatch[2];
                    return hiddenRoutes.unhideVideo(hiddenDeps, collectionId, videoId);
                });
            }

            // ==================== CACHE API ====================

            // GET /api/cache/stats - Get cache statistics
            if (path === '/api/cache/stats' && req.method === 'GET') {
                return handleApiRequest(() => 
                    cacheRoutes.getCacheStats(cacheDeps)
                );
            }
            
            // DELETE /api/cache - Clear the image cache
            if (path === '/api/cache' && req.method === 'DELETE') {
                return handleApiRequest(() => 
                    cacheRoutes.clearCacheHandler(cacheDeps)
                );
            }

            return withCors(Response.json({ error: 'Not found' }, { status: 404 }));
        }

        // ==================== IMAGE PROXY ROUTES ====================
        
        // GET /img/:channelHandle/:videoId/:type - Proxy and cache YouTube thumbnails
        const imageProxyMatch = path.match(/^\/img\/(@?[^/]+)\/([^/]+)\/([^/]+)$/);
        if (imageProxyMatch) {
            const channelHandle = decodeURIComponent(imageProxyMatch[1]);
            const videoId = imageProxyMatch[2];
            const type = imageProxyMatch[3];
            return imagesRoutes.getThumbnail(imagesDeps, channelHandle, videoId, type);
        }
        
        // GET /avatar/:channelHandle - Proxy and cache channel avatars
        const avatarProxyMatch = path.match(/^\/avatar\/(@?[^/]+)$/);
        if (avatarProxyMatch) {
            const channelHandle = decodeURIComponent(avatarProxyMatch[1]);
            const avatarUrl = url.searchParams.get('url');
            return imagesRoutes.getAvatar(imagesDeps, channelHandle, avatarUrl);
        }

        // ==================== STATIC FILE SERVING ====================
        
        let filePath = path === '/' ? '/index.html' : path;
        const fullPath = join(PUBLIC_DIR, filePath);

        try {
            const file = Bun.file(fullPath);
            if (await file.exists()) {
                const contentType = getContentType(filePath);
                return new Response(file, {
                    headers: { 'Content-Type': contentType },
                });
            }
        } catch (e) {
            // File not found, continue to 404
        }

        return new Response('Not Found', { status: 404 });
    },
});

function getContentType(path: string): string {
    if (path.endsWith('.html')) return 'text/html';
    if (path.endsWith('.css')) return 'text/css';
    if (path.endsWith('.js')) return 'application/javascript';
    if (path.endsWith('.json')) return 'application/json';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.svg')) return 'image/svg+xml';
    return 'application/octet-stream';
}

await ensureDataDir();
console.log(`🚀 YouTube Viewer running at http://localhost:${server.port}`);
