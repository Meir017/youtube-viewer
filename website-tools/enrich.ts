#!/usr/bin/env bun
/**
 * Offline video enrichment tool for the website database
 * 
 * Usage:
 *   bun run website-tools/enrich.ts [options]
 * 
 * Options:
 *   --collection=<id>   Only enrich a specific collection (default: all collections)
 *   --concurrency=<n>   Number of concurrent requests (default: 5)
 *   --delay=<ms>        Delay between requests in ms (default: 2000)
 *   --dry-run           Show what would be enriched without making changes
 *   --limit=<n>         Max videos to enrich per run (default: unlimited)
 */

import { fetchVideoDetails } from '../generator/api';
import type { Video } from '../generator/types';
import path from 'path';

// Configuration
const DATA_FILE = path.join(import.meta.dir, '..', 'website', 'data', 'channels.json');
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_DELAY_MS = 2000;
const SAVE_INTERVAL_MS = 10000; // Save every 10 seconds

// Types matching website structure
interface StoredChannel {
    id: string;
    handle: string;
    addedAt: string;
    data?: {
        channel: any;
        videos: Video[];
    };
    lastUpdated?: string;
}

interface Collection {
    id: string;
    name: string;
    channels: StoredChannel[];
    createdAt?: string;
}

interface ChannelsData {
    collections: Collection[];
}

// Parse CLI arguments
function parseArgs(): {
    collectionId: string | null;
    concurrency: number;
    delay: number;
    dryRun: boolean;
    limit: number | null;
} {
    const args = process.argv.slice(2);
    let collectionId: string | null = null;
    let concurrency = DEFAULT_CONCURRENCY;
    let delay = DEFAULT_DELAY_MS;
    let dryRun = false;
    let limit: number | null = null;

    for (const arg of args) {
        if (arg.startsWith('--collection=')) {
            collectionId = arg.split('=')[1];
        } else if (arg.startsWith('--concurrency=')) {
            concurrency = parseInt(arg.split('=')[1], 10);
        } else if (arg.startsWith('--delay=')) {
            delay = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--dry-run') {
            dryRun = true;
        } else if (arg.startsWith('--limit=')) {
            limit = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Video Enrichment Tool

Usage:
  bun run website-tools/enrich.ts [options]

Options:
  --collection=<id>   Only enrich a specific collection (default: all)
  --concurrency=<n>   Number of concurrent requests (default: ${DEFAULT_CONCURRENCY})
  --delay=<ms>        Delay between requests in ms (default: ${DEFAULT_DELAY_MS})
  --dry-run           Show what would be enriched without making changes
  --limit=<n>         Max videos to enrich per run (default: unlimited)
  --help, -h          Show this help message
`);
            process.exit(0);
        }
    }

    return { collectionId, concurrency, delay, dryRun, limit };
}

// Load database
async function loadData(): Promise<ChannelsData> {
    const file = Bun.file(DATA_FILE);
    if (!(await file.exists())) {
        console.error(`❌ Database not found: ${DATA_FILE}`);
        process.exit(1);
    }
    return await file.json();
}

// Save database
async function saveData(data: ChannelsData): Promise<void> {
    await Bun.write(DATA_FILE, JSON.stringify(data, null, 2));
}

// Check if video needs enrichment
function needsEnrichment(video: Video): boolean {
    return !video.isShort && !video.publishDate && !video.description;
}

// Collect videos that need enrichment
interface VideoRef {
    collectionIndex: number;
    channelIndex: number;
    videoIndex: number;
    videoId: string;
    title: string;
    collectionName: string;
    channelHandle: string;
}

function collectVideosToEnrich(data: ChannelsData, collectionId: string | null): VideoRef[] {
    const videos: VideoRef[] = [];

    for (let ci = 0; ci < data.collections.length; ci++) {
        const collection = data.collections[ci];
        
        // Skip if filtering by collection
        if (collectionId && collection.id !== collectionId) {
            continue;
        }

        for (let chi = 0; chi < collection.channels.length; chi++) {
            const channel = collection.channels[chi];
            const channelVideos = channel.data?.videos || [];

            for (let vi = 0; vi < channelVideos.length; vi++) {
                const video = channelVideos[vi];
                if (needsEnrichment(video)) {
                    videos.push({
                        collectionIndex: ci,
                        channelIndex: chi,
                        videoIndex: vi,
                        videoId: video.videoId,
                        title: video.title || video.videoId,
                        collectionName: collection.name,
                        channelHandle: channel.handle,
                    });
                }
            }
        }
    }

    return videos;
}

// Calculate stats for display
function getStats(data: ChannelsData): {
    totalCollections: number;
    totalChannels: number;
    totalVideos: number;
    enrichedVideos: number;
    shortsCount: number;
    needingEnrichment: number;
} {
    let totalChannels = 0;
    let totalVideos = 0;
    let enrichedVideos = 0;
    let shortsCount = 0;
    let needingEnrichment = 0;

    for (const collection of data.collections) {
        totalChannels += collection.channels.length;
        
        for (const channel of collection.channels) {
            const videos = channel.data?.videos || [];
            for (const video of videos) {
                if (video.isShort) {
                    shortsCount++;
                } else {
                    totalVideos++;
                    if (video.publishDate || video.description) {
                        enrichedVideos++;
                    } else {
                        needingEnrichment++;
                    }
                }
            }
        }
    }

    return {
        totalCollections: data.collections.length,
        totalChannels,
        totalVideos,
        enrichedVideos,
        shortsCount,
        needingEnrichment,
    };
}

// Main enrichment process
async function runEnrichment(): Promise<void> {
    const { collectionId, concurrency, delay, dryRun, limit } = parseArgs();

    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║           Video Enrichment Tool                        ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log();

    // Load database
    console.log(`📂 Loading database from ${DATA_FILE}...`);
    const data = await loadData();

    // Show current stats
    const stats = getStats(data);
    console.log();
    console.log('📊 Current Database Stats:');
    console.log(`   Collections: ${stats.totalCollections}`);
    console.log(`   Channels:    ${stats.totalChannels}`);
    console.log(`   Videos:      ${stats.totalVideos} (+ ${stats.shortsCount} shorts)`);
    console.log(`   Enriched:    ${stats.enrichedVideos} (${((stats.enrichedVideos / stats.totalVideos) * 100).toFixed(1)}%)`);
    console.log(`   Needing:     ${stats.needingEnrichment}`);
    console.log();

    // Collect videos to enrich
    let videosToEnrich = collectVideosToEnrich(data, collectionId);
    
    if (videosToEnrich.length === 0) {
        console.log('✅ All videos are already enriched!');
        return;
    }

    // Apply limit
    if (limit && videosToEnrich.length > limit) {
        console.log(`📋 Limiting to ${limit} videos (of ${videosToEnrich.length} total)`);
        videosToEnrich = videosToEnrich.slice(0, limit);
    }

    // Show what will be enriched
    console.log(`🎯 Found ${videosToEnrich.length} videos to enrich`);
    
    if (collectionId) {
        console.log(`   Filtering: collection "${collectionId}"`);
    }
    
    console.log(`   Concurrency: ${concurrency}`);
    console.log(`   Delay: ${delay}ms between requests`);
    console.log();

    // Group by collection for display
    const collectionGroups = new Map<string, number>();
    for (const v of videosToEnrich) {
        const key = v.collectionName;
        collectionGroups.set(key, (collectionGroups.get(key) || 0) + 1);
    }
    console.log('📝 Videos by collection:');
    for (const [name, count] of collectionGroups) {
        console.log(`   ${name}: ${count} videos`);
    }
    console.log();

    if (dryRun) {
        console.log('🔍 DRY RUN - no changes will be made');
        console.log();
        console.log('First 10 videos that would be enriched:');
        for (const video of videosToEnrich.slice(0, 10)) {
            console.log(`   [${video.collectionName}] ${video.channelHandle}: ${video.title.substring(0, 50)}...`);
        }
        return;
    }

    // Run enrichment
    console.log('🚀 Starting enrichment...');
    console.log();

    let enriched = 0;
    let failed = 0;
    let rateLimited = false;
    let lastSaveTime = Date.now();
    let nextIndex = 0;

    function getNextIndex(): number {
        if (rateLimited) return -1;
        const idx = nextIndex;
        if (idx >= videosToEnrich.length) return -1;
        nextIndex++;
        return idx;
    }

    async function maybeSave(): Promise<void> {
        const now = Date.now();
        if (now - lastSaveTime >= SAVE_INTERVAL_MS) {
            lastSaveTime = now;
            await saveData(data);
            console.log(`   💾 Progress saved (${enriched} enriched)`);
        }
    }

    async function processVideo(index: number): Promise<boolean> {
        const videoRef = videosToEnrich[index];
        
        try {
            const details = await fetchVideoDetails(videoRef.videoId);
            
            // Update video in data
            const video = data.collections[videoRef.collectionIndex]
                .channels[videoRef.channelIndex]
                .data?.videos[videoRef.videoIndex];
            
            if (video) {
                video.publishDate = details.publishDate ?? undefined;
                video.description = details.description ?? undefined;
            }
            
            enriched++;
            
            if (enriched % 10 === 0 || enriched === videosToEnrich.length) {
                const pct = ((enriched / videosToEnrich.length) * 100).toFixed(1);
                console.log(`   ✓ Progress: ${enriched}/${videosToEnrich.length} (${pct}%)${failed > 0 ? ` - ${failed} failed` : ''}`);
            }
            
            await maybeSave();
            return true;
        } catch (err: any) {
            if (err.message?.includes('429') || err.message?.includes('Too Many Requests')) {
                console.warn(`   ⚠️  Rate limited (HTTP 429) - stopping enrichment`);
                rateLimited = true;
                return false;
            }
            failed++;
            if (failed <= 5) {
                console.warn(`   ❌ Failed ${videoRef.videoId}: ${err.message}`);
            } else if (failed === 6) {
                console.warn(`   (suppressing further failure messages)`);
            }
            return true;
        }
    }

    async function worker(workerId: number): Promise<void> {
        // Stagger worker startup
        if (workerId > 0) {
            await Bun.sleep(Math.floor(delay / concurrency) * workerId);
        }

        while (true) {
            const index = getNextIndex();
            if (index < 0) break;
            
            const shouldContinue = await processVideo(index);
            if (!shouldContinue) break;
            
            if (!rateLimited) {
                await Bun.sleep(delay);
            }
        }
    }

    // Start workers
    const workerCount = Math.min(concurrency, videosToEnrich.length);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i++) {
        workers.push(worker(i));
    }

    await Promise.all(workers);

    // Final save
    await saveData(data);

    console.log();
    console.log('════════════════════════════════════════════════════════');
    console.log('📊 Enrichment Complete');
    console.log(`   ✅ Enriched: ${enriched}`);
    console.log(`   ❌ Failed:   ${failed}`);
    if (rateLimited) {
        console.log(`   ⚠️  Stopped due to rate limiting`);
        console.log(`   💡 Try again later with --delay=3000 or higher`);
    }
    console.log('════════════════════════════════════════════════════════');
}

// Run
runEnrichment().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
