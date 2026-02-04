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

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
};

// Progress bar helper
function progressBar(current: number, total: number, width: number = 30): string {
    const pct = total > 0 ? current / total : 0;
    const filled = Math.round(pct * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${colors.cyan}${bar}${colors.reset}`;
}

// Format duration
function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else if (seconds > 0) {
        return `${seconds}s`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
}

// Truncate string with ellipsis
function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 1) + '…';
}

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

    console.log();
    console.log(`${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}║           Video Enrichment Tool                        ║${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log();

    // Load database
    console.log(`${colors.dim}📂 Loading database...${colors.reset}`);
    const data = await loadData();

    // Show current stats
    const stats = getStats(data);
    console.log();
    console.log(`${colors.bold}📊 Database Overview${colors.reset}`);
    console.log(`   ${colors.dim}Collections:${colors.reset} ${stats.totalCollections}`);
    console.log(`   ${colors.dim}Channels:${colors.reset}    ${stats.totalChannels}`);
    console.log(`   ${colors.dim}Videos:${colors.reset}      ${stats.totalVideos} ${colors.gray}(+ ${stats.shortsCount} shorts)${colors.reset}`);
    
    const enrichedPct = stats.totalVideos > 0 ? ((stats.enrichedVideos / stats.totalVideos) * 100).toFixed(1) : '0';
    console.log(`   ${colors.green}Enriched:${colors.reset}    ${stats.enrichedVideos} ${colors.gray}(${enrichedPct}%)${colors.reset}`);
    console.log(`   ${colors.yellow}Pending:${colors.reset}     ${stats.needingEnrichment}`);
    console.log();

    // Collect videos to enrich
    let videosToEnrich = collectVideosToEnrich(data, collectionId);
    
    if (videosToEnrich.length === 0) {
        console.log(`${colors.green}✅ All videos are already enriched!${colors.reset}`);
        return;
    }

    // Apply limit
    if (limit && videosToEnrich.length > limit) {
        console.log(`${colors.yellow}📋 Limiting to ${limit} videos${colors.reset} ${colors.dim}(of ${videosToEnrich.length} total)${colors.reset}`);
        videosToEnrich = videosToEnrich.slice(0, limit);
    }

    // Show what will be enriched
    console.log(`${colors.bold}🎯 Enrichment Plan${colors.reset}`);
    console.log(`   ${colors.dim}Videos:${colors.reset}      ${videosToEnrich.length}`);
    
    if (collectionId) {
        console.log(`   ${colors.dim}Filter:${colors.reset}      collection "${collectionId}"`);
    }
    
    console.log(`   ${colors.dim}Concurrency:${colors.reset} ${concurrency} workers`);
    console.log(`   ${colors.dim}Delay:${colors.reset}       ${delay}ms`);
    console.log();

    // Group by collection for display
    const collectionGroups = new Map<string, number>();
    for (const v of videosToEnrich) {
        const key = v.collectionName;
        collectionGroups.set(key, (collectionGroups.get(key) || 0) + 1);
    }
    console.log(`${colors.dim}By collection:${colors.reset}`);
    for (const [name, count] of collectionGroups) {
        console.log(`   ${colors.magenta}${name}${colors.reset}: ${count} videos`);
    }
    console.log();

    if (dryRun) {
        console.log(`${colors.yellow}🔍 DRY RUN${colors.reset} ${colors.dim}- no changes will be made${colors.reset}`);
        console.log();
        console.log(`${colors.dim}Sample videos that would be enriched:${colors.reset}`);
        for (const video of videosToEnrich.slice(0, 10)) {
            console.log(`   ${colors.magenta}${video.channelHandle}${colors.reset} ${colors.dim}${truncate(video.title, 50)}${colors.reset}`);
        }
        if (videosToEnrich.length > 10) {
            console.log(`   ${colors.gray}... and ${videosToEnrich.length - 10} more${colors.reset}`);
        }
        return;
    }

    // Run enrichment
    console.log(`${colors.bold}🚀 Starting enrichment...${colors.reset}`);
    console.log();

    let enriched = 0;
    let failed = 0;
    let rateLimited = false;
    let lastSaveTime = Date.now();
    let nextIndex = 0;
    const startTime = Date.now();

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
            console.log(`   ${colors.blue}💾 Progress saved${colors.reset}`);
        }
    }

    function printProgress(videoRef: VideoRef, success: boolean): void {
        const total = videosToEnrich.length;
        const completed = enriched + failed;
        const pct = ((completed / total) * 100).toFixed(0);
        
        // Calculate ETA
        const elapsed = Date.now() - startTime;
        const avgTimePerVideo = completed > 0 ? elapsed / completed : 0;
        const remaining = total - completed;
        const eta = avgTimePerVideo * remaining;
        
        const status = success 
            ? `${colors.green}✓${colors.reset}` 
            : `${colors.red}✗${colors.reset}`;
        
        const bar = progressBar(completed, total, 15);
        const pctStr = `${colors.bold}${pct.padStart(3)}%${colors.reset}`;
        const countStr = `${colors.gray}${completed}/${total}${colors.reset}`;
        const etaStr = remaining > 0 ? `${colors.dim}${formatDuration(eta)}${colors.reset}` : '';
        
        const channelStr = `${colors.magenta}${truncate(videoRef.channelHandle, 12)}${colors.reset}`;
        const titleStr = `${colors.dim}${truncate(videoRef.title, 30)}${colors.reset}`;
        
        console.log(`${status} ${bar} ${pctStr} ${countStr} ${channelStr} ${titleStr} ${etaStr}`);
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
            printProgress(videoRef, true);
            
            await maybeSave();
            return true;
        } catch (err: any) {
            if (err.message?.includes('429') || err.message?.includes('Too Many Requests')) {
                console.log();
                console.log(`   ${colors.yellow}⚠️  Rate limited (HTTP 429) - stopping enrichment${colors.reset}`);
                rateLimited = true;
                return false;
            }
            failed++;
            printProgress(videoRef, false);
            if (failed <= 3) {
                console.log(`      ${colors.red}└─ ${err.message}${colors.reset}`);
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
    
    const totalTime = Date.now() - startTime;

    console.log();
    console.log(`${colors.bold}════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}📊 Enrichment Complete${colors.reset}`);
    console.log();
    console.log(`   ${colors.green}✅ Enriched:${colors.reset}  ${enriched}`);
    if (failed > 0) {
        console.log(`   ${colors.red}❌ Failed:${colors.reset}    ${failed}`);
    }
    console.log(`   ${colors.blue}⏱️  Duration:${colors.reset} ${formatDuration(totalTime)}`);
    if (enriched > 0) {
        const avgTime = totalTime / enriched;
        console.log(`   ${colors.dim}   Avg:      ${formatDuration(avgTime)}/video${colors.reset}`);
    }
    if (rateLimited) {
        console.log();
        console.log(`   ${colors.yellow}⚠️  Stopped due to rate limiting${colors.reset}`);
        console.log(`   ${colors.dim}💡 Try again later with --delay=3000 or higher${colors.reset}`);
    }
    console.log(`${colors.bold}════════════════════════════════════════════════════════${colors.reset}`);
}

// Run
runEnrichment().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
