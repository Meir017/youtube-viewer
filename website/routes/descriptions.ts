import type { DescriptionsStoreInterface } from '../descriptions-store';

export interface DescriptionsHandlerDeps {
    descriptionsStore: DescriptionsStoreInterface;
}

export async function getVideoDescription(
    deps: DescriptionsHandlerDeps,
    videoId: string
): Promise<Response> {
    const description = await deps.descriptionsStore.get(videoId);
    return Response.json({ description });
}
