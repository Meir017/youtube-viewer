import type { StoreInterface } from '../store';

export interface StarredHandlerDeps {
    store: StoreInterface;
}

/**
 * GET /api/collections/:collectionId/starred - Get list of starred video IDs
 */
export async function getStarredVideos(
    deps: StarredHandlerDeps,
    collectionId: string
): Promise<Response> {
    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    return Response.json(collection.starredVideos || []);
}

/**
 * POST /api/collections/:collectionId/starred/:videoId - Star a video
 */
export async function starVideo(
    deps: StarredHandlerDeps,
    collectionId: string,
    videoId: string
): Promise<Response> {
    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    if (!collection.starredVideos) {
        collection.starredVideos = [];
    }

    if (!collection.starredVideos.includes(videoId)) {
        collection.starredVideos.push(videoId);
        await deps.store.save(store);
    }

    return Response.json({ success: true, starredVideos: collection.starredVideos });
}

/**
 * DELETE /api/collections/:collectionId/starred/:videoId - Unstar a video
 */
export async function unstarVideo(
    deps: StarredHandlerDeps,
    collectionId: string,
    videoId: string
): Promise<Response> {
    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    if (collection.starredVideos) {
        const index = collection.starredVideos.indexOf(videoId);
        if (index !== -1) {
            collection.starredVideos.splice(index, 1);
            await deps.store.save(store);
        }
    }

    return Response.json({ success: true, starredVideos: collection.starredVideos || [] });
}
