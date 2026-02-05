import type { StoreInterface } from '../store';
import type { 
    Collection,
    EnrichmentStatus 
} from '../video-enrichment';

export interface EnrichmentService {
    getEnrichmentStatus(collection: Collection): EnrichmentStatus;
    startEnrichment(
        collection: Collection,
        saveCallback: () => Promise<void>
    ): { started: boolean; message?: string; job: any };
}

export interface EnrichmentHandlerDeps {
    store: StoreInterface;
    enrichmentService: EnrichmentService;
}

/**
 * GET /api/collections/:collectionId/enrich/status - Get enrichment status
 */
export async function getEnrichmentStatusHandler(
    deps: EnrichmentHandlerDeps,
    collectionId: string
): Promise<Response> {
    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    const status = deps.enrichmentService.getEnrichmentStatus(collection);
    return Response.json(status);
}

/**
 * POST /api/collections/:collectionId/enrich - Start enrichment job
 */
export async function startEnrichmentHandler(
    deps: EnrichmentHandlerDeps,
    collectionId: string
): Promise<Response> {
    const store = await deps.store.load();
    const collection = store.collections.find(c => c.id === collectionId);
    
    if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 404 });
    }

    const result = deps.enrichmentService.startEnrichment(
        collection, 
        () => deps.store.save(store)
    );
    return Response.json(result);
}
