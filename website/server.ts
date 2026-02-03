import { join } from 'path';
import { processChannelForWeb, type WebChannelData } from './channel-processor';

const DATA_FILE = join(import.meta.dir, 'data', 'channels.json');
const PUBLIC_DIR = join(import.meta.dir, 'public');

interface StoredChannel {
    id: string;
    handle: string;
    addedAt: string;
    data?: WebChannelData;
    lastUpdated?: string;
}

interface ChannelsStore {
    channels: StoredChannel[];
}

async function loadStore(): Promise<ChannelsStore> {
    try {
        const file = Bun.file(DATA_FILE);
        if (await file.exists()) {
            return await file.json();
        }
    } catch (e) {
        console.error('Error loading store:', e);
    }
    return { channels: [] };
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
                'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            };

            if (req.method === 'OPTIONS') {
                return new Response(null, { headers: corsHeaders });
            }

            // GET /api/channels - List all channels (optionally refresh with maxAgeDays)
            if (path === '/api/channels' && req.method === 'GET') {
                const maxAgeDaysParam = url.searchParams.get('maxAgeDays');
                const store = await loadStore();
                
                // If maxAgeDays is provided, refresh all channels with the new setting
                if (maxAgeDaysParam) {
                    const maxAgeDays = parseInt(maxAgeDaysParam) || 30;
                    console.log(`Refreshing all channels with maxAgeDays=${maxAgeDays}`);
                    
                    for (const channel of store.channels) {
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
                
                return Response.json(store.channels, { headers: corsHeaders });
            }

            // POST /api/channels - Add a new channel
            if (path === '/api/channels' && req.method === 'POST') {
                try {
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
                    
                    // Check if already exists
                    if (store.channels.some(c => c.handle.toLowerCase() === handle.toLowerCase())) {
                        return Response.json({ error: 'Channel already exists' }, { status: 409, headers: corsHeaders });
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

                    store.channels.push(newChannel);
                    await saveStore(store);

                    return Response.json(newChannel, { status: 201, headers: corsHeaders });
                } catch (e: any) {
                    console.error('Error adding channel:', e);
                    return Response.json({ error: e.message || 'Failed to add channel' }, { status: 500, headers: corsHeaders });
                }
            }

            // DELETE /api/channels/:id - Remove a channel
            const deleteMatch = path.match(/^\/api\/channels\/([^/]+)$/);
            if (deleteMatch && req.method === 'DELETE') {
                const id = deleteMatch[1];
                const store = await loadStore();
                const index = store.channels.findIndex(c => c.id === id);
                
                if (index === -1) {
                    return Response.json({ error: 'Channel not found' }, { status: 404, headers: corsHeaders });
                }

                store.channels.splice(index, 1);
                await saveStore(store);

                return Response.json({ success: true }, { headers: corsHeaders });
            }

            // POST /api/channels/:id/refresh - Refresh channel data
            const refreshMatch = path.match(/^\/api\/channels\/([^/]+)\/refresh$/);
            if (refreshMatch && req.method === 'POST') {
                const id = refreshMatch[1];
                const store = await loadStore();
                const channel = store.channels.find(c => c.id === id);
                
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

            return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
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
