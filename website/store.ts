import { join } from 'path';
import type { Collection, StoredChannel } from './video-enrichment';
import {
    createDescriptionsStore,
    type DescriptionsStoreInterface,
    type VideoDescriptions,
} from './descriptions-store';
import { createLogger } from '../generator/logger.ts';

const log = createLogger('store');
const descriptionsStore = createDescriptionsStore();

const DATA_FILE = join(import.meta.dir, 'data', 'channels.json');

export interface ChannelsStore {
    collections: Collection[];
    // Legacy support
    channels?: StoredChannel[];
}

export interface StoreInterface {
    load(): Promise<ChannelsStore>;
    save(store: ChannelsStore): Promise<void>;
    /** Pre-warm the cache by loading from disk. */
    warmup?(): Promise<void>;
}

function stripDescriptionsFromChannels(
    channels: StoredChannel[] | undefined,
    descriptions: VideoDescriptions
): boolean {
    let hasDescriptions = false;

    if (!channels) {
        return false;
    }

    for (const channel of channels) {
        for (const video of channel.data?.videos || []) {
            if (typeof video.description === 'string') {
                descriptions[video.videoId] = video.description;
                delete video.description;
                hasDescriptions = true;
            }
        }
    }

    return hasDescriptions;
}

export function splitDescriptionsFromStore(store: ChannelsStore): {
    store: ChannelsStore;
    descriptions: VideoDescriptions;
    hasDescriptions: boolean;
} {
    const strippedStore = structuredClone(store) as ChannelsStore;
    strippedStore.collections = strippedStore.collections || [];

    const descriptions: VideoDescriptions = {};
    let hasDescriptions = false;

    hasDescriptions = stripDescriptionsFromChannels(strippedStore.channels, descriptions) || hasDescriptions;

    for (const collection of strippedStore.collections) {
        hasDescriptions = stripDescriptionsFromChannels(collection.channels, descriptions) || hasDescriptions;
    }

    return {
        store: strippedStore,
        descriptions,
        hasDescriptions,
    };
}

async function persistDescriptions(
    descriptions: VideoDescriptions,
    targetDescriptionsStore: DescriptionsStoreInterface = descriptionsStore
): Promise<void> {
    if (Object.keys(descriptions).length === 0) {
        return;
    }

    const existingDescriptions = await targetDescriptionsStore.load();
    await targetDescriptionsStore.save({
        ...existingDescriptions,
        ...descriptions,
    });
}

/**
 * Load the store from disk.
 * Returns empty store if file doesn't exist or is corrupted.
 * Automatically migrates legacy format (channels array) to collections.
 */
export async function loadStore(
    dataFile: string = DATA_FILE,
    targetDescriptionsStore: DescriptionsStoreInterface = descriptionsStore
): Promise<ChannelsStore> {
    try {
        const file = Bun.file(dataFile);
        if (await file.exists()) {
            const data = await file.json() as ChannelsStore;
            const needsLegacyMigration = Boolean(data.channels && !data.collections);
            const storeData: ChannelsStore = needsLegacyMigration
                ? {
                    collections: [{
                        id: crypto.randomUUID(),
                        name: 'Default',
                        channels: data.channels || [],
                        createdAt: new Date().toISOString(),
                    }],
                }
                : {
                    ...data,
                    collections: data.collections || [],
                };

            const stripped = splitDescriptionsFromStore(storeData);
            await persistDescriptions(stripped.descriptions, targetDescriptionsStore);

            if (needsLegacyMigration || stripped.hasDescriptions) {
                await saveStore(stripped.store, dataFile, targetDescriptionsStore);
            }

            return stripped.store;
        }
    } catch (e) {
        log.error('Error loading store:', e);
    }
    return { collections: [] };
}

/**
 * Save the store to disk.
 */
export async function saveStore(
    store: ChannelsStore,
    dataFile: string = DATA_FILE,
    targetDescriptionsStore: DescriptionsStoreInterface = descriptionsStore
): Promise<void> {
    const stripped = splitDescriptionsFromStore(store);
    await persistDescriptions(stripped.descriptions, targetDescriptionsStore);
    await Bun.write(dataFile, JSON.stringify(stripped.store, null, 2));
}

/**
 * Ensure the data directory exists.
 */
export async function ensureDataDir(): Promise<void> {
    const dir = join(import.meta.dir, 'data');
    const dirFile = Bun.file(join(dir, '.gitkeep'));
    if (!(await dirFile.exists())) {
        await Bun.write(join(dir, '.gitkeep'), '');
    }
}

/**
 * Create a store instance (for dependency injection).
 * Uses in-memory caching: first load() reads from disk, subsequent loads return cached data.
 * save() writes through to disk and updates the cache.
 */
export function createStore(
    dataFile: string = DATA_FILE,
    targetDescriptionsStore: DescriptionsStoreInterface = descriptionsStore
): StoreInterface {
    let cached: ChannelsStore | null = null;

    return {
        async load() {
            if (cached) return cached;
            cached = await loadStore(dataFile, targetDescriptionsStore);
            return cached;
        },
        async save(store) {
            await saveStore(store, dataFile, targetDescriptionsStore);
            cached = store;
        },
        async warmup() {
            if (!cached) {
                cached = await loadStore(dataFile, targetDescriptionsStore);
            }
        },
    };
}

/**
 * Create an in-memory store for testing.
 */
export function createInMemoryStore(initialData?: ChannelsStore): StoreInterface {
    let data: ChannelsStore = initialData || { collections: [] };
    return {
        load: async () => data,
        save: async (store: ChannelsStore) => { data = store; },
    };
}
