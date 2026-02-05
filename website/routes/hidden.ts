import type { StoreInterface } from '../store';

export interface HiddenHandlerDeps {
    store: StoreInterface;
}

/**
 * GET /api/collections/:collectionId/hidden - Get list of hidden video IDs
 */
export async function getHiddenVideos(
    deps: HiddenHandlerDeps,
    collectionId: string
): Promise<Response> {
    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    return Response.json(collection.hiddenVideos || []);
}

/**
 * POST /api/collections/:collectionId/hidden/:videoId - Hide a video
 */
export async function hideVideo(
    deps: HiddenHandlerDeps,
    collectionId: string,
    videoId: string
): Promise<Response> {
    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Initialize hiddenVideos array if needed
    if (!collection.hiddenVideos) {
        collection.hiddenVideos = [];
    }

    // Add video to hidden list if not already there
    if (!collection.hiddenVideos.includes(videoId)) {
        collection.hiddenVideos.push(videoId);
        await deps.store.save(store);
    }

    return Response.json({ success: true, hiddenVideos: collection.hiddenVideos });
}

/**
 * DELETE /api/collections/:collectionId/hidden/:videoId - Unhide a video
 */
export async function unhideVideo(
    deps: HiddenHandlerDeps,
    collectionId: string,
    videoId: string
): Promise<Response> {
    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Remove video from hidden list
    if (collection.hiddenVideos) {
        const index = collection.hiddenVideos.indexOf(videoId);
        if (index !== -1) {
            collection.hiddenVideos.splice(index, 1);
            await deps.store.save(store);
        }
    }

    return Response.json({ success: true, hiddenVideos: collection.hiddenVideos || [] });
}
