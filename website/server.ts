import { join } from 'path';
import { processChannelForWeb, type WebChannelData } from './channel-processor';
import { getCachedImage, getCachedAvatar, getCacheStats, clearCache } from './image-cache';
import { 
    getEnrichmentJob, 
    getEnrichmentStatus, 
    startEnrichment,
    type Collection,
    type StoredChannel 
} from './video-enrichment';

const DATA_FILE = join(import.meta.dir, 'data', 'channels.json');
const PUBLIC_DIR = join(import.meta.dir, 'public');

interface ChannelsStore {
    collections: Collection[];
    // Legacy support
    channels?: StoredChannel[];
}

async function loadStore(): Promise<ChannelsStore> {
    try {
        const file = Bun.file(DATA_FILE);
        if (await file.exists()) {
            const data = await file.json();
            // Migrate legacy format (channels array) to collections
            if (data.channels && !data.collections) {
                const migratedStore: ChannelsStore = {
                    collections: [{
                        id: crypto.randomUUID(),
                        name: 'Default',
                        channels: data.channels,
                        createdAt: new Date().toISOString(),
                    }]
                };
                await saveStore(migratedStore);
                return migratedStore;
            }
            return data;
        }
    } catch (e) {
        console.error('Error loading store:', e);
    }
    return { collections: [] };
}

async function saveStore(store: ChannelsStore): Promise<void> {
    const dir = join(import.meta.dir, 'data');
    await Bun.write(DATA_FILE, JSON.stringify(store, null, 2));
}

async function ensureDataDir(): Promise<void> {
    const dir = join(import.meta.dir, 'data');
    const dirFile = Bun.file(join(dir, '.gitkeep'));
    if (!(await dirFile.exists())) {
        await Bun.write(join(dir, '.gitkeep'), '');
    }
}

const server = Bun.serve({
    port: 3000,
    async fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;

        // API Routes
        if (path.startsWith('/api/')) {
            // CORS headers for API
            const corsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            };

            if (req.method === 'OPTIONS') {
                return new Response(null, { headers: corsHeaders });
            }

            // ==================== COLLECTIONS API ====================
            
            // GET /api/collections - List all collections
            if (path === '/api/collections' && req.method === 'GET') {
                const store = await loadStore();
                return Response.json(store.collections, { headers: corsHeaders });
            }

            // POST /api/collections - Create a new collection
            if (path === '/api/collections' && req.method === 'POST') {
                try {
                    const body = await req.json() as { name: string };
                    const name = body.name?.trim();
                    
                    if (!name) {
                        return Response.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders });
                    }

                    const store = await loadStore();
                    
                    const newCollection: Collection = {
                        id: crypto.randomUUID(),
                        name,
                        channels: [],
                        createdAt: new Date().toISOString(),
                    };

                    store.collections.push(newCollection);
                    await saveStore(store);

                    return Response.json(newCollection, { status: 201, headers: corsHeaders });
                } catch (e: any) {
                    console.error('Error creating collection:', e);
                    return Response.json({ error: e.message || 'Failed to create collection' }, { status: 500, headers: corsHeaders });
                }
            }

            // PUT /api/collections/:id - Update collection name
            const updateCollectionMatch = path.match(/^\/api\/collections\/([^/]+)$/);
            if (updateCollectionMatch && req.method === 'PUT') {
                try {
                    const id = updateCollectionMatch[1];
                    const body = await req.json() as { name: string };
                    const name = body.name?.trim();

                    if (!name) {
                        return Response.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders });
                    }

                    const store = await loadStore();
                    const collection = store.collections.find(c => c.id === id);
                    
                    if (!collection) {
                        return Response.json({ error: 'Collection not found' }, { status: 404, headers: corsHeaders });
                    }

                    collection.name = name;
                    await saveStore(store);

                    return Response.json(collection, { headers: corsHeaders });
                } catch (e: any) {
                    console.error('Error updating collection:', e);
                    return Response.json({ error: e.message || 'Failed to update collection' }, { status: 500, headers: corsHeaders });
                }
            }

            // DELETE /api/collections/:id - Delete a collection
            const deleteCollectionMatch = path.match(/^\/api\/collections\/([^/]+)$/);
            if (deleteCollectionMatch && req.method === 'DELETE') {
                const id = deleteCollectionMatch[1];
                const store = await loadStore();
                const index = store.collections.findIndex(c => c.id === id);
                
                if (index === -1) {
                    return Response.json({ error: 'Collection not found' }, { status: 404, headers: corsHeaders });
                }

                store.collections.splice(index, 1);
                await saveStore(store);

                return Response.json({ success: true }, { headers: corsHeaders });
            }

            // ==================== CHANNELS WITHIN COLLECTIONS API ====================
            
            // GET /api/collections/:collectionId/channels - List channels in collection (optionally refresh with maxAgeDays)
            const listChannelsMatch = path.match(/^\/api\/collections\/([^/]+)\/channels$/);
            if (listChannelsMatch && req.method === 'GET') {
                const collectionId = listChannelsMatch[1];
                const maxAgeDaysParam = url.searchParams.get('maxAgeDays');
                const store = await loadStore();
                const collection = store.collections.find(c => c.id === collectionId);
                
                if (!collection) {
                    return Response.json({ error: 'Collection not found' }, { status: 404, headers: corsHeaders });
                }
                
                // If maxAgeDays is provided, refresh all channels with the new setting
                if (maxAgeDaysParam) {
                    const maxAgeDays = parseInt(maxAgeDaysParam) || 30;
                    console.log(`Refreshing all channels in collection "${collection.name}" with maxAgeDays=${maxAgeDays}`);
                    
                    for (const channel of collection.channels) {
                        try {
                            console.log(`  Refreshing: ${channel.handle}`);
                            const channelData = await processChannelForWeb(channel.handle, { maxAgeDays });
                            channel.data = channelData;
                            channel.lastUpdated = new Date().toISOString();
                        } catch (e) {
                            console.error(`  Failed to refresh ${channel.handle}:`, e);
                        }
                    }
                    
                    await saveStore(store);
                }
                
                return Response.json(collection.channels, { headers: corsHeaders });
            }

            // POST /api/collections/:collectionId/channels - Add a channel to collection
            const addChannelMatch = path.match(/^\/api\/collections\/([^/]+)\/channels$/);
            if (addChannelMatch && req.method === 'POST') {
                try {
                    const collectionId = addChannelMatch[1];
                    const body = await req.json() as { handle: string };
                    let handle = body.handle?.trim();
                    
                    if (!handle) {
                        return Response.json({ error: 'Handle is required' }, { status: 400, headers: corsHeaders });
                    }

                    // Ensure handle starts with @
                    if (!handle.startsWith('@')) {
                        handle = '@' + handle;
                    }

                    const store = await loadStore();
                    const collection = store.collections.find(c => c.id === collectionId);
                    
                    if (!collection) {
                        return Response.json({ error: 'Collection not found' }, { status: 404, headers: corsHeaders });
                    }
                    
                    // Check if already exists in this collection
                    if (collection.channels.some(c => c.handle.toLowerCase() === handle.toLowerCase())) {
                        return Response.json({ error: 'Channel already exists in this collection' }, { status: 409, headers: corsHeaders });
                    }

                    // Fetch channel data
                    console.log(`Fetching data for channel: ${handle}`);
                    const channelData = await processChannelForWeb(handle);

                    const newChannel: StoredChannel = {
                        id: crypto.randomUUID(),
                        handle,
                        addedAt: new Date().toISOString(),
                        data: channelData,
                        lastUpdated: new Date().toISOString(),
                    };

                    collection.channels.push(newChannel);
                    await saveStore(store);

                    return Response.json(newChannel, { status: 201, headers: corsHeaders });
                } catch (e: any) {
                    console.error('Error adding channel:', e);
                    return Response.json({ error: e.message || 'Failed to add channel' }, { status: 500, headers: corsHeaders });
                }
            }

            // DELETE /api/collections/:collectionId/channels/:channelId - Remove a channel from collection
            const deleteChannelMatch = path.match(/^\/api\/collections\/([^/]+)\/channels\/([^/]+)$/);
            if (deleteChannelMatch && req.method === 'DELETE') {
                const collectionId = deleteChannelMatch[1];
                const channelId = deleteChannelMatch[2];
                const store = await loadStore();
                const collection = store.collections.find(c => c.id === collectionId);
                
                if (!collection) {
                    return Response.json({ error: 'Collection not found' }, { status: 404, headers: corsHeaders });
                }
                
                const index = collection.channels.findIndex(c => c.id === channelId);
                
                if (index === -1) {
                    return Response.json({ error: 'Channel not found' }, { status: 404, headers: corsHeaders });
                }

                collection.channels.splice(index, 1);
                await saveStore(store);

                return Response.json({ success: true }, { headers: corsHeaders });
            }

            // POST /api/collections/:collectionId/channels/:channelId/refresh - Refresh channel data
            const refreshChannelMatch = path.match(/^\/api\/collections\/([^/]+)\/channels\/([^/]+)\/refresh$/);
            if (refreshChannelMatch && req.method === 'POST') {
                const collectionId = refreshChannelMatch[1];
                const channelId = refreshChannelMatch[2];
                const store = await loadStore();
                const collection = store.collections.find(c => c.id === collectionId);
                
                if (!collection) {
                    return Response.json({ error: 'Collection not found' }, { status: 404, headers: corsHeaders });
                }
                
                const channel = collection.channels.find(c => c.id === channelId);
                
                if (!channel) {
                    return Response.json({ error: 'Channel not found' }, { status: 404, headers: corsHeaders });
                }

                console.log(`Refreshing data for channel: ${channel.handle}`);
                const channelData = await processChannelForWeb(channel.handle);
                channel.data = channelData;
                channel.lastUpdated = new Date().toISOString();
                await saveStore(store);

                return Response.json(channel, { headers: corsHeaders });
            }

            // ==================== ENRICHMENT API ====================

            // GET /api/collections/:collectionId/enrich/status - Get enrichment status
            const enrichStatusMatch = path.match(/^\/api\/collections\/([^/]+)\/enrich\/status$/);
            if (enrichStatusMatch && req.method === 'GET') {
                const collectionId = enrichStatusMatch[1];
                const store = await loadStore();
                const collection = store.collections.find(c => c.id === collectionId);
                
                if (!collection) {
                    return Response.json({ error: 'Collection not found' }, { status: 404, headers: corsHeaders });
                }

                const status = getEnrichmentStatus(collection);
                return Response.json(status, { headers: corsHeaders });
            }

            // POST /api/collections/:collectionId/enrich - Start enrichment job
            const enrichMatch = path.match(/^\/api\/collections\/([^/]+)\/enrich$/);
            if (enrichMatch && req.method === 'POST') {
                const collectionId = enrichMatch[1];
                const store = await loadStore();
                const collection = store.collections.find(c => c.id === collectionId);
                
                if (!collection) {
                    return Response.json({ error: 'Collection not found' }, { status: 404, headers: corsHeaders });
                }

                const result = startEnrichment(collection, () => saveStore(store));
                return Response.json(result, { headers: corsHeaders });
            }

            return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
        }

        // ==================== IMAGE PROXY ROUTES ====================
        
        // GET /img/:channelHandle/:videoId/:type - Proxy and cache YouTube thumbnails
        // Example: /img/@GitHub/abc123xyz/mqdefault
        const imageProxyMatch = path.match(/^\/img\/(@?[^/]+)\/([^/]+)\/([^/]+)$/);
        if (imageProxyMatch) {
            const channelHandle = decodeURIComponent(imageProxyMatch[1]);
            const videoId = imageProxyMatch[2];
            const type = imageProxyMatch[3];
            
            const result = await getCachedImage(channelHandle, videoId, type);
            
            if (result.error || !result.file) {
                // Return a placeholder or error response
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
        
        // GET /avatar/:channelHandle - Proxy and cache channel avatars
        // Example: /avatar/@GitHub?url=https://yt3.googleusercontent.com/...
        const avatarProxyMatch = path.match(/^\/avatar\/(@?[^/]+)$/);
        if (avatarProxyMatch) {
            const channelHandle = decodeURIComponent(avatarProxyMatch[1]);
            const avatarUrl = url.searchParams.get('url');
            
            if (!avatarUrl) {
                return new Response('Missing avatar URL parameter', {
                    status: 400,
                    headers: { 'Content-Type': 'text/plain' },
                });
            }
            
            const result = await getCachedAvatar(channelHandle, avatarUrl);
            
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
        
        // GET /api/cache/stats - Get cache statistics
        if (path === '/api/cache/stats' && req.method === 'GET') {
            const stats = await getCacheStats();
            return Response.json(stats, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
        
        // DELETE /api/cache - Clear the image cache
        if (path === '/api/cache' && req.method === 'DELETE') {
            const count = await clearCache();
            return Response.json({ cleared: count }, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        // Static file serving
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
