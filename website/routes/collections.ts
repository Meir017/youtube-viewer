import type { StoreInterface } from '../store';
import type { Collection } from '../video-enrichment';

export interface CollectionsHandlerDeps {
    store: StoreInterface;
}

/**
 * GET /api/collections - List all collections
 */
export async function listCollections(deps: CollectionsHandlerDeps): Promise<Response> {
    const store = await deps.store.load();
    return Response.json(store.collections);
}

/**
 * POST /api/collections - Create a new collection
 */
export async function createCollection(
    deps: CollectionsHandlerDeps,
    body: { name?: string }
): Promise<Response> {
    const name = body.name?.trim();
    
    if (!name) {
        return Response.json({ error: 'Name is required' }, { status: 400 });
    }

    const store = await deps.store.load();
    
    const newCollection: Collection = {
        id: crypto.randomUUID(),
        name,
        channels: [],
        createdAt: new Date().toISOString(),
    };

    store.collections.push(newCollection);
    await deps.store.save(store);

    return Response.json(newCollection, { status: 201 });
}

/**
 * PUT /api/collections/:id - Update collection name
 */
export async function updateCollection(
    deps: CollectionsHandlerDeps,
    id: string,
    body: { name?: string }
): Promise<Response> {
    const name = body.name?.trim();

    if (!name) {
        return Response.json({ error: 'Name is required' }, { status: 400 });
    }

    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === id);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    collection.name = name;
    await deps.store.save(store);

    return Response.json(collection);
}

/**
 * DELETE /api/collections/:id - Delete a collection
 */
export async function deleteCollection(
    deps: CollectionsHandlerDeps,
    id: string
): Promise<Response> {
    const store = await deps.store.load();
    const index = store.collections.findIndex(c => c.id === id);
    
    if (index === -1) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    store.collections.splice(index, 1);
    await deps.store.save(store);

    return Response.json({ success: true });
}
