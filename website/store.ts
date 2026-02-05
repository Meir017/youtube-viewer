import { join } from 'path';
import type { Collection, StoredChannel } from './video-enrichment';

const DATA_FILE = join(import.meta.dir, 'data', 'channels.json');

export interface ChannelsStore {
    collections: Collection[];
    // Legacy support
    channels?: StoredChannel[];
}

export interface StoreInterface {
    load(): Promise<ChannelsStore>;
    save(store: ChannelsStore): Promise<void>;
}

/**
 * Load the store from disk.
 * Returns empty store if file doesn't exist or is corrupted.
 * Automatically migrates legacy format (channels array) to collections.
 */
export async function loadStore(): Promise<ChannelsStore> {
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

/**
 * Save the store to disk.
 */
export async function saveStore(store: ChannelsStore): Promise<void> {
    await Bun.write(DATA_FILE, JSON.stringify(store, null, 2));
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
 * This allows tests to provide mock implementations.
 */
export function createStore(): StoreInterface {
    return {
        load: loadStore,
        save: saveStore,
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
