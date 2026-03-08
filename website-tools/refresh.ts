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

// Parse view count string (e.g. "1,234 views", "1.2K views", "1.2M views") to a number
function parseViewCount(viewCount?: string): number {
    if (!viewCount) return 0;
    const str = viewCount.toLowerCase().replace(/,/g, '').replace(/\s*views?\s*/i, '').trim();
    if (!str || str === 'no') return 0;
    const match = str.match(/^([\d.]+)\s*([kmb])?$/);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const suffix = match[2];
    switch (suffix) {
        case 'k': return Math.round(num * 1_000);
        case 'm': return Math.round(num * 1_000_000);
        case 'b': return Math.round(num * 1_000_000_000);
        default: return Math.round(num);
    }
}

// Format a number with commas
function formatNumber(n: number): string {
    return n.toLocaleString('en-US');
}

// Per-channel refresh result for the log
interface ChannelRefreshResult {
    handle: string;
    collectionName: string;
    failed: boolean;
    error?: string;
    newVideos: Video[];
    viewChanges: { title: string; videoId: string; oldViews: number; newViews: number }[];
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
    const refreshResults: ChannelRefreshResult[] = [];

    await Promise.all(channelsToRefresh.map(async (ref) => {
        const channel = data.collections[ref.collectionIndex].channels[ref.channelIndex];
        const existingVideos = channel.data?.videos ?? [];

        // Snapshot existing view counts for comparison
        const existingViewMap = new Map<string, number>();
        for (const video of existingVideos) {
            existingViewMap.set(video.videoId, parseViewCount(video.viewCount));
        }
        const existingIds = new Set(existingVideos.map(v => v.videoId));

        try {
            const freshData = await processChannelForWeb(channel.handle, { maxAgeDays: ref.maxAgeDays });
            const mergedVideos = mergeVideos(existingVideos, freshData.videos);
            const newCount = mergedVideos.length - existingVideos.length;

            // Collect new videos (in fresh data but not in existing)
            const newVideos = freshData.videos.filter(v => !existingIds.has(v.videoId));

            // Collect view count changes for existing videos
            const viewChanges: ChannelRefreshResult['viewChanges'] = [];
            for (const video of freshData.videos) {
                if (existingIds.has(video.videoId)) {
                    const oldViews = existingViewMap.get(video.videoId) ?? 0;
                    const newViews = parseViewCount(video.viewCount);
                    if (newViews !== oldViews) {
                        viewChanges.push({
                            title: video.title ?? video.videoId,
                            videoId: video.videoId,
                            oldViews,
                            newViews,
                        });
                    }
                }
            }

            refreshResults.push({
                handle: ref.handle,
                collectionName: ref.collectionName,
                failed: false,
                newVideos,
                viewChanges,
            });

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

            refreshResults.push({
                handle: ref.handle,
                collectionName: ref.collectionName,
                failed: true,
                error: err.message,
                newVideos: [],
                viewChanges: [],
            });

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
    }));

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

    // Generate refresh-log.md
    await writeRefreshLog(refreshResults, { refreshed, failed, totalTime });
}

// Generate and write refresh-log.md
async function writeRefreshLog(
    results: ChannelRefreshResult[],
    summary: { refreshed: number; failed: number; totalTime: number }
): Promise<void> {
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

    const totalNewVideos = results.reduce((sum, r) => sum + r.newVideos.length, 0);
    const totalViewChanges = results.reduce((sum, r) => sum + r.viewChanges.length, 0);

    const lines: string[] = [];
    lines.push(`# Refresh Log — ${dateStr}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`| ------ | ----- |`);
    lines.push(`| Channels refreshed | ${summary.refreshed} |`);
    if (summary.failed > 0) {
        lines.push(`| Failed | ${summary.failed} |`);
    }
    lines.push(`| New videos | ${totalNewVideos} |`);
    lines.push(`| View count changes | ${totalViewChanges} |`);
    lines.push(`| Duration | ${formatDuration(summary.totalTime)} |`);
    lines.push('');

    // Group results by collection
    const byCollection = new Map<string, ChannelRefreshResult[]>();
    for (const r of results) {
        const list = byCollection.get(r.collectionName) ?? [];
        list.push(r);
        byCollection.set(r.collectionName, list);
    }

    for (const [collectionName, channelResults] of byCollection) {
        lines.push(`## ${collectionName}`);
        lines.push('');

        for (const result of channelResults) {
            if (result.failed) {
                lines.push(`### ❌ ${result.handle}`);
                lines.push('');
                lines.push(`> Error: ${result.error}`);
                lines.push('');
                continue;
            }

            const hasChanges = result.newVideos.length > 0 || result.viewChanges.length > 0;
            if (!hasChanges) {
                lines.push(`### ✅ ${result.handle} — no changes`);
                lines.push('');
                continue;
            }

            lines.push(`### ✅ ${result.handle}`);
            lines.push('');

            if (result.newVideos.length > 0) {
                lines.push(`**New videos (${result.newVideos.length}):**`);
                lines.push('');
                for (const video of result.newVideos) {
                    const title = video.title ?? video.videoId;
                    const views = video.viewCount ?? 'N/A';
                    const published = video.publishedTime ?? '';
                    lines.push(`- [${title}](https://youtube.com/watch?v=${video.videoId}) — ${views}${published ? `, ${published}` : ''}`);
                }
                lines.push('');
            }

            if (result.viewChanges.length > 0) {
                // Sort by largest absolute change first
                const sorted = [...result.viewChanges].sort((a, b) => Math.abs(b.newViews - b.oldViews) - Math.abs(a.newViews - a.oldViews));
                lines.push(`**View count changes (${sorted.length}):**`);
                lines.push('');
                lines.push(`| Video | Previous | Current | Change |`);
                lines.push(`| ----- | -------: | ------: | -----: |`);
                for (const vc of sorted) {
                    const diff = vc.newViews - vc.oldViews;
                    const sign = diff >= 0 ? '+' : '';
                    lines.push(`| [${truncate(vc.title, 50)}](https://youtube.com/watch?v=${vc.videoId}) | ${formatNumber(vc.oldViews)} | ${formatNumber(vc.newViews)} | ${sign}${formatNumber(diff)} |`);
                }
                lines.push('');
            }
        }
    }

    const logPath = 'refresh-log.md';
    await Bun.write(logPath, lines.join('\n'));
    console.log();
    console.log(`${colors.dim}📝 Log written to ${logPath}${colors.reset}`);
}

// Run
runRefresh().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
