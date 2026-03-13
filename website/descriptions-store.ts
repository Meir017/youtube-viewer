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

export function createDescriptionsStore(filePath: string = DESCRIPTIONS_FILE): DescriptionsStoreInterface {
    return {
        load: () => loadDescriptions(filePath),
        save: (descriptions) => saveDescriptions(descriptions, filePath),
        get: (videoId) => getDescription(videoId, filePath),
        set: (videoId, description) => setDescription(videoId, description, filePath),
    };
}
