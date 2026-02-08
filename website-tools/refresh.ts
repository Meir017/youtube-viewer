#!/usr/bin/env bun
/**
 * Offline channel refresh tool for the website database
 * 
 * Usage:
 *   bun run website-tools/refresh.ts [options]
 * 
 * Options:
 *   --collection=<id>   Only refresh a specific collection (default: all collections)
 *   --dry-run           Show what would be refreshed without making changes
 *   --help, -h          Show this help message
 */

import { createStore, ensureDataDir } from '../website/store';
import { processChannelForWeb } from '../website/channel-processor';
import type { StoredChannel } from '../website/video-enrichment';
import type { Video } from '../generator/types';

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

// Parse CLI arguments
function parseArgs(): {
    collectionId: string | null;
    dryRun: boolean;
} {
    const args = process.argv.slice(2);
    let collectionId: string | null = null;
    let dryRun = false;

    for (const arg of args) {
        if (arg.startsWith('--collection=')) {
            collectionId = arg.split('=')[1];
        } else if (arg === '--dry-run') {
            dryRun = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Channel Refresh Tool

Usage:
  bun run website-tools/refresh.ts [options]

Options:
  --collection=<id>   Only refresh a specific collection (default: all)
  --dry-run           Show what would be refreshed without making changes
  --help, -h          Show this help message
`);
            process.exit(0);
        }
    }

    return { collectionId, dryRun };
}

/**
 * Estimate the age in days of a video from its relative publishedTime string (e.g. "2 months ago").
 * Returns Infinity if unparseable.
 */
function estimateDaysFromPublishedTime(publishedTime?: string): number {
    if (!publishedTime) return Infinity;
    const str = publishedTime.toLowerCase();
    const match = str.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/);
    if (!match) return Infinity;
    const num = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 'second': case 'minute': case 'hour': return 0;
        case 'day': return num;
        case 'week': return num * 7;
        case 'month': return num * 30;
        case 'year': return num * 365;
        default: return Infinity;
    }
}

/**
 * Estimate the age in days of a video from its enriched publishDate (ISO date string).
 */
function estimateDaysFromPublishDate(publishDate?: string): number {
    if (!publishDate) return Infinity;
    const date = new Date(publishDate);
    if (isNaN(date.getTime())) return Infinity;
    const now = new Date();
    return Math.ceil((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Find the maximum age in days among all videos of a channel.
 * This determines how far back we need to fetch to cover all existing videos.
 */
function findOldestVideoAgeDays(videos: Video[]): number {
    let maxDays = 0;
    for (const video of videos) {
        // Prefer enriched publishDate if available, otherwise use relative publishedTime
        const days = video.publishDate
            ? estimateDaysFromPublishDate(video.publishDate)
            : estimateDaysFromPublishedTime(video.publishedTime);
        if (days !== Infinity && days > maxDays) {
            maxDays = days;
        }
    }
    return maxDays;
}

/**
 * Merge new videos into existing videos, deduplicating by videoId.
 * New videos take precedence for non-enrichment fields; enrichment data is preserved from existing.
 */
function mergeVideos(existing: Video[], fresh: Video[]): Video[] {
    const enrichmentMap = new Map<string, { publishDate?: string; description?: string }>();
    for (const video of existing) {
        if (video.publishDate || video.description) {
            enrichmentMap.set(video.videoId, {
                publishDate: video.publishDate,
                description: video.description,
            });
        }
    }

    const seen = new Set<string>();
    const merged: Video[] = [];

    // Add all fresh videos first (they have up-to-date metadata)
    for (const video of fresh) {
        if (seen.has(video.videoId)) continue;
        seen.add(video.videoId);
        // Restore enrichment data if available
        const enrichment = enrichmentMap.get(video.videoId);
        if (enrichment) {
            video.publishDate = enrichment.publishDate;
            video.description = enrichment.description;
        }
        merged.push(video);
    }

    // Add existing videos that weren't in the fresh set (older videos beyond fetch range)
    for (const video of existing) {
        if (seen.has(video.videoId)) continue;
        seen.add(video.videoId);
        merged.push(video);
    }

    return merged;
}

// Channel reference for tracking
interface ChannelRef {
    collectionIndex: number;
    channelIndex: number;
    handle: string;
    collectionName: string;
    existingVideoCount: number;
    oldestDays: number;
    maxAgeDays: number;
}

// Collect channels to refresh
function collectChannelsToRefresh(
    data: { collections: Array<{ id: string; name: string; channels: StoredChannel[] }> },
    collectionId: string | null
): ChannelRef[] {
    const channels: ChannelRef[] = [];

    for (let ci = 0; ci < data.collections.length; ci++) {
        const collection = data.collections[ci];
        if (collectionId && collection.id !== collectionId) continue;

        for (let chi = 0; chi < collection.channels.length; chi++) {
            const channel = collection.channels[chi];
            const existingVideos = channel.data?.videos ?? [];
            const oldestDays = findOldestVideoAgeDays(existingVideos);
            const maxAgeDays = Math.max(30, oldestDays + 7);

            channels.push({
                collectionIndex: ci,
                channelIndex: chi,
                handle: channel.handle,
                collectionName: collection.name,
                existingVideoCount: existingVideos.length,
                oldestDays,
                maxAgeDays,
            });
        }
    }

    return channels;
}

// Calculate stats for display
function getStats(data: { collections: Array<{ channels: StoredChannel[] }> }): {
    totalCollections: number;
    totalChannels: number;
    totalVideos: number;
    shortsCount: number;
} {
    let totalChannels = 0;
    let totalVideos = 0;
    let shortsCount = 0;

    for (const collection of data.collections) {
        totalChannels += collection.channels.length;

        for (const channel of collection.channels) {
            const videos = channel.data?.videos || [];
            for (const video of videos) {
                if (video.isShort) {
                    shortsCount++;
                } else {
                    totalVideos++;
                }
            }
        }
    }

    return {
        totalCollections: data.collections.length,
        totalChannels,
        totalVideos,
        shortsCount,
    };
}

async function runRefresh(): Promise<void> {
    const { collectionId, dryRun } = parseArgs();

    console.log();
    console.log(`${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}║           Channel Refresh Tool                         ║${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log();

    await ensureDataDir();
    const store = createStore();

    // Load database
    console.log(`${colors.dim}📂 Loading database...${colors.reset}`);
    const data = await store.load();

    if (data.collections.length === 0) {
        console.log(`${colors.yellow}No collections found. Nothing to refresh.${colors.reset}`);
        return;
    }

    // Show current stats
    const stats = getStats(data);
    console.log();
    console.log(`${colors.bold}📊 Database Overview${colors.reset}`);
    console.log(`   ${colors.dim}Collections:${colors.reset} ${stats.totalCollections}`);
    console.log(`   ${colors.dim}Channels:${colors.reset}    ${stats.totalChannels}`);
    console.log(`   ${colors.dim}Videos:${colors.reset}      ${stats.totalVideos} ${colors.gray}(+ ${stats.shortsCount} shorts)${colors.reset}`);
    console.log();

    // Collect channels to refresh
    const channelsToRefresh = collectChannelsToRefresh(data, collectionId);

    if (channelsToRefresh.length === 0) {
        console.log(`${colors.yellow}No channels found to refresh.${colors.reset}`);
        return;
    }

    // Show refresh plan
    console.log(`${colors.bold}🎯 Refresh Plan${colors.reset}`);
    console.log(`   ${colors.dim}Channels:${colors.reset}    ${channelsToRefresh.length}`);

    if (collectionId) {
        console.log(`   ${colors.dim}Filter:${colors.reset}      collection "${collectionId}"`);
    }
    console.log();

    // Group by collection for display
    const collectionGroups = new Map<string, number>();
    for (const ch of channelsToRefresh) {
        collectionGroups.set(ch.collectionName, (collectionGroups.get(ch.collectionName) || 0) + 1);
    }
    console.log(`${colors.dim}By collection:${colors.reset}`);
    for (const [name, count] of collectionGroups) {
        console.log(`   ${colors.magenta}${name}${colors.reset}: ${count} channels`);
    }
    console.log();

    if (dryRun) {
        console.log(`${colors.yellow}🔍 DRY RUN${colors.reset} ${colors.dim}- no changes will be made${colors.reset}`);
        console.log();
        console.log(`${colors.dim}Channels that would be refreshed:${colors.reset}`);
        for (const ch of channelsToRefresh.slice(0, 10)) {
            console.log(`   ${colors.magenta}${ch.handle}${colors.reset} ${colors.dim}(${ch.existingVideoCount} videos, oldest ~${ch.oldestDays}d, maxAge=${ch.maxAgeDays}d)${colors.reset}`);
        }
        if (channelsToRefresh.length > 10) {
            console.log(`   ${colors.gray}... and ${channelsToRefresh.length - 10} more${colors.reset}`);
        }
        return;
    }

    // Run refresh
    console.log(`${colors.bold}🚀 Starting refresh...${colors.reset}`);
    console.log();

    let refreshed = 0;
    let failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < channelsToRefresh.length; i++) {
        const ref = channelsToRefresh[i];
        const channel = data.collections[ref.collectionIndex].channels[ref.channelIndex];
        const existingVideos = channel.data?.videos ?? [];

        try {
            const freshData = await processChannelForWeb(channel.handle, { maxAgeDays: ref.maxAgeDays });
            const mergedVideos = mergeVideos(existingVideos, freshData.videos);
            const newCount = mergedVideos.length - existingVideos.length;

            channel.data = {
                channel: freshData.channel,
                videos: mergedVideos,
            };
            channel.lastUpdated = new Date().toISOString();

            refreshed++;

            const completed = refreshed + failed;
            const total = channelsToRefresh.length;
            const pct = ((completed / total) * 100).toFixed(0);
            const elapsed = Date.now() - startTime;
            const avgTime = completed > 0 ? elapsed / completed : 0;
            const remaining = total - completed;
            const eta = avgTime * remaining;

            const bar = progressBar(completed, total, 15);
            const pctStr = `${colors.bold}${pct.padStart(3)}%${colors.reset}`;
            const countStr = `${colors.gray}${completed}/${total}${colors.reset}`;
            const etaStr = remaining > 0 ? `${colors.dim}${formatDuration(eta)}${colors.reset}` : '';
            const channelStr = `${colors.magenta}${truncate(ref.handle, 20)}${colors.reset}`;
            const detailStr = `${colors.dim}${freshData.videos.length} fetched, ${mergedVideos.length} total (${newCount >= 0 ? '+' : ''}${newCount} new)${colors.reset}`;

            console.log(`${colors.green}✓${colors.reset} ${bar} ${pctStr} ${countStr} ${channelStr} ${detailStr} ${etaStr}`);
        } catch (err: any) {
            failed++;

            const completed = refreshed + failed;
            const total = channelsToRefresh.length;
            const pct = ((completed / total) * 100).toFixed(0);
            const bar = progressBar(completed, total, 15);
            const pctStr = `${colors.bold}${pct.padStart(3)}%${colors.reset}`;
            const countStr = `${colors.gray}${completed}/${total}${colors.reset}`;
            const channelStr = `${colors.magenta}${truncate(ref.handle, 20)}${colors.reset}`;

            console.log(`${colors.red}✗${colors.reset} ${bar} ${pctStr} ${countStr} ${channelStr}`);
            if (failed <= 3) {
                console.log(`      ${colors.red}└─ ${err.message}${colors.reset}`);
            }
        }
    }

    await store.save(data);

    const totalTime = Date.now() - startTime;

    console.log();
    console.log(`${colors.bold}════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}📊 Refresh Complete${colors.reset}`);
    console.log();
    console.log(`   ${colors.green}✅ Refreshed:${colors.reset} ${refreshed}`);
    if (failed > 0) {
        console.log(`   ${colors.red}❌ Failed:${colors.reset}    ${failed}`);
    }
    console.log(`   ${colors.blue}⏱️  Duration:${colors.reset} ${formatDuration(totalTime)}`);
    if (refreshed > 0) {
        const avgTime = totalTime / refreshed;
        console.log(`   ${colors.dim}   Avg:      ${formatDuration(avgTime)}/channel${colors.reset}`);
    }
    console.log(`${colors.bold}════════════════════════════════════════════════════════${colors.reset}`);
}

// Run
runRefresh().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
