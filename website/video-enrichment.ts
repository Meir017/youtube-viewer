import { fetchVideoDetails } from '../generator/api';
import type { WebChannelData } from './channel-processor';

// Enrichment settings
const ENRICH_DELAY_MS = 1500;
const ENRICH_CONCURRENCY = 10;

export interface EnrichmentJob {
    collectionId: string;
    status: 'running' | 'complete' | 'rate-limited' | 'error';
    total: number;
    enriched: number;
    skipped: number;  // shorts or already enriched
    failed: number;
    rateLimited: boolean;
    startedAt: string;
    completedAt?: string;
    error?: string;
}

export interface EnrichmentStatus {
    status: EnrichmentJob['status'] | 'idle';
    total: number;
    enriched: number;
    skipped: number;
    failed: number;
    rateLimited: boolean;
    allEnriched: boolean;
    totalVideos: number;
    enrichedVideos: number;
    shortsCount: number;
}

export interface StoredChannel {
    id: string;
    handle: string;
    addedAt: string;
    data?: WebChannelData;
    lastUpdated?: string;
}

export interface Collection {
    id: string;
    name: string;
    channels: StoredChannel[];
    createdAt: string;
}

// In-memory job tracking
const enrichmentJobs = new Map<string, EnrichmentJob>();

/**
 * Get the current enrichment job for a collection (if any)
 */
export function getEnrichmentJob(collectionId: string): EnrichmentJob | undefined {
    return enrichmentJobs.get(collectionId);
}

/**
 * Calculate enrichment statistics for a collection
 */
export function calculateEnrichmentStats(collection: Collection): {
    totalVideos: number;
    enrichedVideos: number;
    shortsCount: number;
    allEnriched: boolean;
} {
    let totalVideos = 0;
    let enrichedVideos = 0;
    let shortsCount = 0;
    
    for (const channel of collection.channels) {
        const videos = channel.data?.videos || [];
        for (const video of videos) {
            if (video.isShort) {
                shortsCount++;
            } else {
                totalVideos++;
                if (video.publishDate || video.description) {
                    enrichedVideos++;
                }
            }
        }
    }
    
    const allEnriched = totalVideos > 0 && enrichedVideos === totalVideos;
    
    return { totalVideos, enrichedVideos, shortsCount, allEnriched };
}

/**
 * Get full enrichment status for a collection
 */
export function getEnrichmentStatus(collection: Collection): EnrichmentStatus {
    const job = enrichmentJobs.get(collection.id);
    const stats = calculateEnrichmentStats(collection);
    
    return {
        status: job?.status || 'idle',
        total: job?.total || stats.totalVideos,
        enriched: job?.enriched || stats.enrichedVideos,
        skipped: job?.skipped || stats.shortsCount,
        failed: job?.failed || 0,
        rateLimited: job?.rateLimited || false,
        allEnriched: stats.allEnriched,
        totalVideos: stats.totalVideos,
        enrichedVideos: stats.enrichedVideos,
        shortsCount: stats.shortsCount,
    };
}

/**
 * Start an enrichment job for a collection
 * Returns immediately, runs enrichment in background
 */
export function startEnrichment(
    collection: Collection,
    saveCallback: () => Promise<void>
): { started: boolean; message?: string; job: EnrichmentJob } {
    const collectionId = collection.id;
    
    // Check if already running
    const existingJob = enrichmentJobs.get(collectionId);
    if (existingJob && existingJob.status === 'running') {
        return { 
            started: false, 
            message: 'Enrichment already in progress',
            job: existingJob 
        };
    }

    // Count videos to enrich
    let totalVideos = 0;
    let alreadyEnriched = 0;
    let shorts = 0;
    
    for (const channel of collection.channels) {
        const videos = channel.data?.videos || [];
        for (const video of videos) {
            if (video.isShort) {
                shorts++;
            } else if (video.publishDate || video.description) {
                alreadyEnriched++;
            } else {
                totalVideos++;
            }
        }
    }

    // Create job
    const job: EnrichmentJob = {
        collectionId,
        status: 'running',
        total: totalVideos,
        enriched: 0,
        skipped: shorts + alreadyEnriched,
        failed: 0,
        rateLimited: false,
        startedAt: new Date().toISOString(),
    };
    enrichmentJobs.set(collectionId, job);

    // Start enrichment in background (don't await)
    runEnrichment(collection, job, saveCallback).catch(err => {
        console.error(`Enrichment error for collection ${collectionId}:`, err);
        job.status = 'error';
        job.error = err.message;
    });

    return { started: true, job };
}

/**
 * Background enrichment process
 */
async function runEnrichment(
    collection: Collection,
    job: EnrichmentJob,
    saveCallback: () => Promise<void>
): Promise<void> {
    const collectionId = collection.id;
    console.log(`📝 Starting enrichment for collection ${collectionId} (concurrency: ${ENRICH_CONCURRENCY}, delay: ${ENRICH_DELAY_MS}ms)`);

    // Collect all videos that need enrichment
    const videosToEnrich: Array<{ channelIndex: number; videoIndex: number; videoId: string }> = [];
    
    for (let channelIndex = 0; channelIndex < collection.channels.length; channelIndex++) {
        const channel = collection.channels[channelIndex];
        const videos = channel.data?.videos || [];
        
        for (let videoIndex = 0; videoIndex < videos.length; videoIndex++) {
            const video = videos[videoIndex];
            if (!video.isShort && !video.publishDate && !video.description) {
                videosToEnrich.push({ channelIndex, videoIndex, videoId: video.videoId });
            }
        }
    }

    console.log(`  Found ${videosToEnrich.length} videos to enrich`);

    if (videosToEnrich.length === 0) {
        job.status = 'complete';
        job.completedAt = new Date().toISOString();
        return;
    }

    // Shared state for concurrent workers
    let nextIndex = 0;
    let rateLimited = false;
    let lastSaveTime = Date.now();
    const SAVE_INTERVAL_MS = 5000; // Save at most every 5 seconds

    // Thread-safe index getter
    function getNextIndex(): number {
        if (rateLimited) return -1;
        const idx = nextIndex;
        if (idx >= videosToEnrich.length) return -1;
        nextIndex++;
        return idx;
    }

    // Periodic save (debounced)
    async function maybeSave(): Promise<void> {
        const now = Date.now();
        if (now - lastSaveTime >= SAVE_INTERVAL_MS) {
            lastSaveTime = now;
            await saveCallback();
        }
    }

    async function processVideo(index: number): Promise<boolean> {
        const { channelIndex, videoIndex, videoId } = videosToEnrich[index];
        
        try {
            const details = await fetchVideoDetails(videoId);
            
            // Update video in collection
            const channel = collection.channels[channelIndex];
            const video = channel.data?.videos[videoIndex];
            if (video) {
                video.publishDate = details.publishDate ?? undefined;
                video.description = details.description ?? undefined;
            }
            
            job.enriched++;
            
            if (job.enriched % 10 === 0 || job.enriched === job.total) {
                console.log(`  Progress: ${job.enriched}/${job.total} videos enriched (${job.failed} failed)`);
            }
            
            await maybeSave();
            return true;
        } catch (err: any) {
            if (err.message?.includes('429') || err.message?.includes('Too Many Requests')) {
                console.warn(`  Rate limited (429) - stopping all workers`);
                rateLimited = true;
                job.rateLimited = true;
                return false;
            }
            job.failed++;
            if (job.failed <= 5) {
                console.warn(`  Failed to enrich video ${videoId}: ${err.message}`);
            } else if (job.failed === 6) {
                console.warn(`  (suppressing further failure messages)`);
            }
            return true; // Continue processing despite individual failures
        }
    }

    async function worker(workerId: number): Promise<void> {
        // Stagger worker startup to avoid thundering herd
        if (workerId > 0) {
            await Bun.sleep(Math.floor(ENRICH_DELAY_MS / ENRICH_CONCURRENCY) * workerId);
        }

        while (true) {
            const index = getNextIndex();
            if (index < 0) break;
            
            const shouldContinue = await processVideo(index);
            if (!shouldContinue) break;
            
            // Per-worker delay between requests
            if (!rateLimited) {
                await Bun.sleep(ENRICH_DELAY_MS);
            }
        }
    }

    // Start concurrent workers
    const workerCount = Math.min(ENRICH_CONCURRENCY, videosToEnrich.length);
    console.log(`  Starting ${workerCount} concurrent workers`);
    
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i++) {
        workers.push(worker(i));
    }

    await Promise.all(workers);

    // Final save
    await saveCallback();

    // Update job status
    job.completedAt = new Date().toISOString();
    job.status = rateLimited ? 'rate-limited' : 'complete';
    
    console.log(`✓ Enrichment ${job.status}: ${job.enriched} enriched, ${job.failed} failed${rateLimited ? ' (stopped due to rate limit)' : ''}`);
}
