import type { StoreInterface } from '../store';
import type { WebChannelData } from '../channel-processor';
import type { StoredChannel } from '../video-enrichment';

export interface ChannelProcessor {
    processChannelForWeb(handle: string, config?: { maxAgeDays?: number }): Promise<WebChannelData>;
}

export interface ChannelsHandlerDeps {
    store: StoreInterface;
    channelProcessor: ChannelProcessor;
}

/**
 * GET /api/collections/:collectionId/channels - List channels in collection
 * Optionally refreshes all channels if maxAgeDays query param is provided
 */
export async function listChannels(
    deps: ChannelsHandlerDeps,
    collectionId: string,
    maxAgeDays?: number
): Promise<Response> {
    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }
    
    // If maxAgeDays is provided, refresh all channels with the new setting
    if (maxAgeDays !== undefined) {
        console.log(`Refreshing all channels in collection "${collection.name}" with maxAgeDays=${maxAgeDays}`);
        
        for (const channel of collection.channels) {
            try {
                console.log(`  Refreshing: ${channel.handle}`);
                
                // Preserve existing enrichment data before refresh
                const existingEnrichment = preserveEnrichmentData(channel);
                
                const channelData = await deps.channelProcessor.processChannelForWeb(channel.handle, { maxAgeDays });
                
                // Restore enrichment data to matching videos
                restoreEnrichmentData(channelData, existingEnrichment);
                
                channel.data = channelData;
                channel.lastUpdated = new Date().toISOString();
            } catch (e) {
                console.error(`  Failed to refresh ${channel.handle}:`, e);
            }
        }
        
        await deps.store.save(store);
    }
    
    return Response.json(collection.channels);
}

/**
 * POST /api/collections/:collectionId/channels - Add a channel to collection
 */
export async function addChannel(
    deps: ChannelsHandlerDeps,
    collectionId: string,
    body: { handle?: string }
): Promise<Response> {
    let handle = body.handle?.trim();
    
    if (!handle) {
        return Response.json({ error: 'Handle is required' }, { status: 400 });
    }

    // Ensure handle starts with @
    if (!handle.startsWith('@')) {
        handle = '@' + handle;
    }

    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }
    
    // Check if already exists in this collection
    if (collection.channels.some(c => c.handle.toLowerCase() === handle!.toLowerCase())) {
        return Response.json({ error: 'Channel already exists in this collection' }, { status: 409 });
    }

    // Fetch channel data
    console.log(`Fetching data for channel: ${handle}`);
    const channelData = await deps.channelProcessor.processChannelForWeb(handle);

    const newChannel: StoredChannel = {
        id: crypto.randomUUID(),
        handle,
        addedAt: new Date().toISOString(),
        data: channelData,
        lastUpdated: new Date().toISOString(),
    };

    collection.channels.push(newChannel);
    await deps.store.save(store);

    return Response.json(newChannel, { status: 201 });
}

/**
 * DELETE /api/collections/:collectionId/channels/:channelId - Remove a channel from collection
 */
export async function deleteChannel(
    deps: ChannelsHandlerDeps,
    collectionId: string,
    channelId: string
): Promise<Response> {
    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }
    
    const index = collection.channels.findIndex(c => c.id === channelId);
    
    if (index === -1) {
        return Response.json({ error: 'Channel not found' }, { status: 404 });
    }

    collection.channels.splice(index, 1);
    await deps.store.save(store);

    return Response.json({ success: true });
}

/**
 * POST /api/collections/:collectionId/channels/:channelId/refresh - Refresh channel data
 */
export async function refreshChannel(
    deps: ChannelsHandlerDeps,
    collectionId: string,
    channelId: string
): Promise<Response> {
    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }
    
    const channel = collection.channels.find(c => c.id === channelId);
    
    if (!channel) {
        return Response.json({ error: 'Channel not found' }, { status: 404 });
    }

    console.log(`Refreshing data for channel: ${channel.handle}`);
    
    // Preserve existing enrichment data before refresh
    const existingEnrichment = preserveEnrichmentData(channel);
    
    const channelData = await deps.channelProcessor.processChannelForWeb(channel.handle);
    
    // Restore enrichment data to matching videos
    restoreEnrichmentData(channelData, existingEnrichment);
    
    channel.data = channelData;
    channel.lastUpdated = new Date().toISOString();
    await deps.store.save(store);

    return Response.json(channel);
}

/**
 * Helper: Preserve enrichment data from a channel's videos
 */
function preserveEnrichmentData(channel: StoredChannel): Map<string, { publishDate?: string; description?: string }> {
    const existingEnrichment = new Map<string, { publishDate?: string; description?: string }>();
    if (channel.data?.videos) {
        for (const video of channel.data.videos) {
            if (video.publishDate || video.description) {
                existingEnrichment.set(video.videoId, {
                    publishDate: video.publishDate,
                    description: video.description,
                });
            }
        }
    }
    return existingEnrichment;
}

/**
 * Helper: Restore enrichment data to channel data
 */
function restoreEnrichmentData(
    channelData: WebChannelData,
    existingEnrichment: Map<string, { publishDate?: string; description?: string }>
): void {
    if (existingEnrichment.size > 0 && channelData.videos) {
        let restoredCount = 0;
        for (const video of channelData.videos) {
            const enrichment = existingEnrichment.get(video.videoId);
            if (enrichment) {
                video.publishDate = enrichment.publishDate;
                video.description = enrichment.description;
                restoredCount++;
            }
        }
        if (restoredCount > 0) {
            console.log(`    Preserved enrichment data for ${restoredCount} videos`);
        }
    }
}
