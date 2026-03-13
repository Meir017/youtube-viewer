import { join } from 'path';
import { createLogger } from '../generator/logger.ts';

const log = createLogger('descriptions-store');
const DESCRIPTIONS_FILE = join(import.meta.dir, 'data', 'descriptions.json');

export type VideoDescriptions = Record<string, string>;

export interface DescriptionsStoreInterface {
    load(): Promise<VideoDescriptions>;
    save(descriptions: VideoDescriptions): Promise<void>;
    get(videoId: string): Promise<string | null>;
    set(videoId: string, description: string): Promise<void>;
    /** Pre-warm the cache by loading from disk. */
    warmup?(): Promise<void>;
}

export async function loadDescriptions(filePath: string = DESCRIPTIONS_FILE): Promise<VideoDescriptions> {
    try {
        const file = Bun.file(filePath);
        if (await file.exists()) {
            return await file.json() as VideoDescriptions;
        }
    } catch (e) {
        log.error('Error loading descriptions store:', e);
    }
    return {};
}

export async function saveDescriptions(
    descriptions: VideoDescriptions,
    filePath: string = DESCRIPTIONS_FILE
): Promise<void> {
    await Bun.write(filePath, JSON.stringify(descriptions, null, 2));
}

export async function getDescription(
    videoId: string,
    filePath: string = DESCRIPTIONS_FILE
): Promise<string | null> {
    const descriptions = await loadDescriptions(filePath);
    return descriptions[videoId] ?? null;
}

export async function setDescription(
    videoId: string,
    description: string,
    filePath: string = DESCRIPTIONS_FILE
): Promise<void> {
    const descriptions = await loadDescriptions(filePath);
    descriptions[videoId] = description;
    await saveDescriptions(descriptions, filePath);
}

/**
 * Create a descriptions store instance with in-memory caching.
 * First load() reads from disk, subsequent operations use cached data.
 * save()/set() write through to disk and update the cache.
 */
export function createDescriptionsStore(filePath: string = DESCRIPTIONS_FILE): DescriptionsStoreInterface {
    let cached: VideoDescriptions | null = null;

    return {
        async load() {
            if (cached) return cached;
            cached = await loadDescriptions(filePath);
            return cached;
        },
        async save(descriptions) {
            await saveDescriptions(descriptions, filePath);
            cached = descriptions;
        },
        async get(videoId) {
            const descriptions = cached ?? await this.load();
            return descriptions[videoId] ?? null;
        },
        async set(videoId, description) {
            const descriptions = cached ?? await this.load();
            descriptions[videoId] = description;
            await saveDescriptions(descriptions, filePath);
            cached = descriptions;
        },
        async warmup() {
            if (!cached) {
                cached = await loadDescriptions(filePath);
            }
        },
    };
}
