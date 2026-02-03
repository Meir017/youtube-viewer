import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// TypeScript interfaces
interface ChannelUrls {
    channelIdentifier: string;
    isHandle: boolean;
    channelUrl: string;
    channelShortsUrl: string;
    channelStreamsUrl: string;
    channelAboutUrl: string;
}

interface Video {
    videoId: string;
    title?: string;
    viewCount?: string;
    publishedTime?: string;
    duration?: string;
    isShort?: boolean;
    isStream?: boolean;
    publishDate?: string;
    description?: string;
    channelTitle?: string;
    channelIndex?: number;
}

interface Short {
    videoId: string;
    title?: string;
    viewCount?: string;
    isShort: true;
}

interface ChannelDetails {
    title?: string;
    description?: string;
    vanityUrl?: string;
    channelUrl?: string;
    externalId?: string;
    keywords?: string;
    avatar?: string;
    banner?: string;
    subscriberCount?: string | null;
    videoCount?: string | null;
    viewCount?: string | null;
    joinDate?: string | null;
    country?: string | null;
    links: ChannelLink[];
    aboutContinuationToken?: string | null;
    familyFriendly?: boolean;
    tags?: string[];
}

interface ChannelLink {
    title?: string;
    url?: string;
}

interface ChannelData {
    channel: ChannelDetails;
    videos: Video[];
    originalIndex?: number;
}

interface ExtendedDetails {
    viewCount: string | null;
    joinDate: string | null;
    country: string | null;
    links: ChannelLink[];
}

interface VideosTabResult {
    videos: Video[];
    continuationToken: string | null;
    tabTitle?: string | null;
}

interface ShortsTabResult {
    shorts: Short[];
    continuationToken: string | null;
}

interface BrowseVideosResult {
    videos: Video[];
    rawItemCount: number;
    nextContinuationToken: string | null;
}

interface BrowseShortsResult {
    shorts: Short[];
    rawItemCount: number;
    nextContinuationToken: string | null;
}

interface VideoDetails {
    publishDate: string | null;
    description: string | null;
}

// Parse CLI arguments
const args = Bun.argv.slice(2);
const GENERATE_HTML = args.includes('--html');
const OUTPUT_FILE = args.find(a => a.startsWith('--output='))?.split('=')[1] || 'channel.html';
const CLI_LIMIT = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const CLI_MAX_AGE = args.find(a => a.startsWith('--max-age='))?.split('=')[1];
const CLI_SHORTS_LIMIT = args.find(a => a.startsWith('--shorts-limit='))?.split('=')[1];
const CLI_MIN_LENGTH = args.find(a => a.startsWith('--min-length='))?.split('=')[1];
const ENRICH_VIDEOS = args.includes('--enrich');
const CLI_ENRICH_CONCURRENCY = args.find(a => a.startsWith('--enrich-concurrency='))?.split('=')[1];
const CLI_ENRICH_DELAY = args.find(a => a.startsWith('--enrich-delay='))?.split('=')[1];

// Enrichment settings - conservative defaults to avoid rate limiting
const ENRICH_CONCURRENCY = CLI_ENRICH_CONCURRENCY ? parseInt(CLI_ENRICH_CONCURRENCY, 10) : 1;
const ENRICH_DELAY_MS = CLI_ENRICH_DELAY ? parseInt(CLI_ENRICH_DELAY, 10) : 2000;

// Support multiple channels via multiple --channel= flags or comma-separated values
const channelArgs = args.filter(a => a.startsWith('--channel=')).map(a => a.split('=')[1]);
const channelIds = channelArgs.length > 0 
    ? channelArgs.flatMap(c => c.split(',').map(id => id.trim()).filter(id => id))
    : ['UCYp3rk70ACGXQ4gFAiMr1SQ'];

const browseApiUrl = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';

// Helper to build channel URLs (supports both channel IDs and handles)
const getChannelUrls = (channelIdentifier: string): ChannelUrls => {
    const isHandle = channelIdentifier.startsWith('@');
    const baseUrl = isHandle
        ? `https://www.youtube.com/${channelIdentifier}`
        : `https://www.youtube.com/channel/${channelIdentifier}`;
    
    return {
        channelIdentifier,
        isHandle,
        channelUrl: `${baseUrl}/videos`,
        channelShortsUrl: `${baseUrl}/shorts`,
        channelStreamsUrl: `${baseUrl}/streams`,
        channelAboutUrl: `${baseUrl}/about`,
    };
};

// Maximum number of videos to fetch (set to Infinity for all videos)
const VIDEO_LIMIT = CLI_LIMIT ? parseInt(CLI_LIMIT, 10) : 150;

// Maximum age of videos in days (set to Infinity for no age limit)
const MAX_VIDEO_AGE_DAYS = CLI_MAX_AGE ? parseInt(CLI_MAX_AGE, 10) : Infinity;

// Maximum number of shorts to fetch (0 = disabled)
const SHORTS_LIMIT = CLI_SHORTS_LIMIT ? parseInt(CLI_SHORTS_LIMIT, 10) : 0;

// Minimum video length in seconds (0 = no minimum)
const MIN_VIDEO_LENGTH_SECONDS = CLI_MIN_LENGTH ? parseInt(CLI_MIN_LENGTH, 10) : 0;

// Maximum concurrent channel fetches (based on CPU cores, min 2, max 8)
const MAX_CONCURRENT_CHANNELS = Math.min(8, Math.max(2, os.cpus().length));

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    bgBlue: '\x1b[44m',
};

const log = {
    info: (msg: string) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
    success: (msg: string) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    warn: (msg: string) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
    error: (msg: string) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    fetch: (msg: string) => console.log(`${colors.blue}🌐 ${msg}${colors.reset}`),
    parse: (msg: string) => console.log(`${colors.magenta}🔍 ${msg}${colors.reset}`),
    video: (msg: string) => console.log(`${colors.white}🎬 ${msg}${colors.reset}`),
    header: (msg: string) => console.log(`\n${colors.bright}${colors.bgBlue} ${msg} ${colors.reset}\n`),
    detail: (label: string, value: string) => console.log(`   ${colors.dim}${label}:${colors.reset} ${value}`),
};

const CLIENT_CONTEXT = {
    clientName: 'WEB',
    clientVersion: '2.20260128.05.00',
    acceptHeader: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
};

function parseRelativeTimeTodays(timeStr: string | undefined): number {
    if (!timeStr) return 0;
    const str = timeStr.toLowerCase();
    const match = str.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/);
    if (!match) return 0;
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const daysMultiplier: Record<string, number> = {
        second: 1 / 86400,
        minute: 1 / 1440,
        hour: 1 / 24,
        day: 1,
        week: 7,
        month: 30,
        year: 365
    };
    return num * (daysMultiplier[unit] || 0);
}

function isUpcomingStream(publishedTime: string | undefined): boolean {
    if (!publishedTime) return true;
    const lower = publishedTime.toLowerCase();
    return lower.includes('scheduled') || 
           lower.includes('premieres') || 
           lower.includes('waiting') ||
           lower.includes('upcoming');
}

function isVideoTooOld(publishedTime: string | undefined): boolean {
    if (MAX_VIDEO_AGE_DAYS === Infinity) return false;
    const ageDays = parseRelativeTimeTodays(publishedTime);
    return ageDays > MAX_VIDEO_AGE_DAYS;
}

function parseDurationToSeconds(durationStr: string | undefined): number {
    if (!durationStr) return 0;
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

function isVideoTooShort(duration: string | undefined): boolean {
    if (MIN_VIDEO_LENGTH_SECONDS === 0) return false;
    const durationSeconds = parseDurationToSeconds(duration);
    return durationSeconds < MIN_VIDEO_LENGTH_SECONDS;
}

function isVideoShort(renderer: any): boolean {
    if (!renderer) return false;
    
    const navEndpoint = renderer.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
    if (navEndpoint.includes('/shorts/')) return true;
    
    const overlayBadges = renderer.thumbnailOverlays || [];
    for (const overlay of overlayBadges) {
        const style = overlay.thumbnailOverlayTimeStatusRenderer?.style;
        if (style === 'SHORTS') return true;
    }
    
    for (const overlay of overlayBadges) {
        const iconType = overlay.thumbnailOverlayTimeStatusRenderer?.icon?.iconType;
        if (iconType === 'SHORTS') return true;
    }
    
    return false;
}

function extractVideoFromRenderer(renderer: any): Video {
    return {
        videoId: renderer.videoId,
        title: renderer.title?.runs?.[0]?.text || renderer.title?.simpleText,
        viewCount: renderer.viewCountText?.simpleText || renderer.viewCountText?.runs?.[0]?.text,
        publishedTime: renderer.publishedTimeText?.simpleText,
        duration: renderer.lengthText?.simpleText || renderer.lengthText?.accessibility?.accessibilityData?.label,
        isShort: isVideoShort(renderer),
    };
}

async function fetchChannelPage(url: string): Promise<string> {
    log.fetch(`Requesting page: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const html = await response.text();
    log.success(`Received ${(html.length / 1024).toFixed(1)} KB`);
    return html;
}

async function fetchBrowseData(continuation: string, channelUrl: string): Promise<any> {
    log.fetch(`Fetching more data via Browse API...`);
    
    const payload = {
        context: {
            client: {
                ...CLIENT_CONTEXT,
                mainAppWebInfo: {
                    graftUrl: channelUrl,
                    pwaInstallabilityStatus: 'PWA_INSTALLABILITY_STATUS_CAN_BE_INSTALLED',
                    webDisplayMode: 'WEB_DISPLAY_MODE_BROWSER',
                    isWebNativeShareAvailable: true
                }
            },
            user: {
                lockedSafetyMode: false
            }
        },
        continuation
    };

    const response = await fetch(browseApiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Browse API HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    log.success(`Browse API response received`);
    return data;
}

async function fetchVideoDetails(videoId: string): Promise<VideoDetails> {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    
    const match = html.match(/ytInitialData\s*=\s*(\{.+?\});/s);
    if (!match) {
        throw new Error('Could not find ytInitialData in response');
    }
    
    const startIndex = html.indexOf(match[0]) + match[0].indexOf('{');
    let braceCount = 0;
    let endIndex = startIndex;
    
    for (let i = startIndex; i < html.length; i++) {
        if (html[i] === '{') braceCount++;
        else if (html[i] === '}') braceCount--;
        
        if (braceCount === 0) {
            endIndex = i + 1;
            break;
        }
    }
    
    const json = html.substring(startIndex, endIndex);
    const data = JSON.parse(json);
    
    const contents = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
    let publishDate: string | null = null;
    let description: string | null = null;
    
    for (const content of contents) {
        const primaryInfo = content.videoPrimaryInfoRenderer;
        const secondaryInfo = content.videoSecondaryInfoRenderer;
        
        if (primaryInfo) {
            publishDate = primaryInfo.dateText?.simpleText;
        }
        
        if (secondaryInfo) {
            const attrDesc = secondaryInfo.attributedDescription;
            if (attrDesc?.content) {
                description = attrDesc.content;
            }
        }
    }
    
    return { publishDate, description };
}

async function enrichVideosWithDetails(videos: Video[], concurrency: number): Promise<Video[]> {
    const videosToEnrich = videos.filter(v => !v.isShort);
    const shortsToKeep = videos.filter(v => v.isShort);
    
    if (videosToEnrich.length === 0) {
        return videos;
    }
    
    log.header(`📝 ENRICHING ${videosToEnrich.length} VIDEOS`);
    log.info(`Fetching publish dates and descriptions (concurrency: ${concurrency}, delay: ${ENRICH_DELAY_MS}ms)`);
    
    let completed = 0;
    let failed = 0;
    let rateLimited = 0;
    
    async function processVideo(video: Video): Promise<void> {
        try {
            const details = await fetchVideoDetails(video.videoId);
            video.publishDate = details.publishDate ?? undefined;
            video.description = details.description ?? undefined;
            completed++;
            
            if (completed % 10 === 0 || completed === videosToEnrich.length) {
                log.info(`Progress: ${completed}/${videosToEnrich.length} videos enriched${failed > 0 ? ` (${failed} failed)` : ''}`);
            }
        } catch (err: any) {
            failed++;
            if (err.message.includes('429')) {
                rateLimited++;
                if (rateLimited === 1) {
                    log.warn(`Rate limited (429) - YouTube is throttling requests. Remaining videos will fail.`);
                }
            } else if (failed <= 3) {
                log.warn(`Enrich failed for ${video.videoId}: ${err.message}`);
            }
        }
    }
    
    let nextIndex = 0;
    async function worker(): Promise<void> {
        while (nextIndex < videosToEnrich.length) {
            const index = nextIndex++;
            await processVideo(videosToEnrich[index]);
            await new Promise(r => setTimeout(r, ENRICH_DELAY_MS));
        }
    }
    
    const workers: Promise<void>[] = [];
    const workerCount = Math.min(concurrency, videosToEnrich.length);
    for (let i = 0; i < workerCount; i++) {
        workers.push(worker());
    }
    
    await Promise.all(workers);
    
    if (rateLimited > 0) {
        log.warn(`Enrichment complete: ${completed} succeeded, ${rateLimited} rate-limited (429), ${failed - rateLimited} other failures`);
        log.info(`Tip: Try again later or increase --enrich-delay to avoid rate limiting`);
    } else {
        log.success(`Enrichment complete: ${completed} succeeded, ${failed} failed`);
    }
    
    return [...videosToEnrich, ...shortsToKeep];
}

function extractYtInitialData(html: string): any {
    let match = html.match(/ytInitialData\s*=\s*(\{.+?\});/s);
    
    if (match) {
        log.parse('Using format 1: Direct JSON object (ytInitialData = {...})');
        
        const startIndex = html.indexOf(match[0]) + match[0].indexOf('{');
        let braceCount = 0;
        let endIndex = startIndex;
        
        for (let i = startIndex; i < html.length; i++) {
            if (html[i] === '{') braceCount++;
            else if (html[i] === '}') braceCount--;
            
            if (braceCount === 0) {
                endIndex = i + 1;
                break;
            }
        }
        
        const json = html.substring(startIndex, endIndex);
        log.success(`Extracted JSON: ${(json.length / 1024).toFixed(1)} KB`);
        return JSON.parse(json);
    }
    
    match = html.match(/var\s+ytInitialData\s*=\s*'(.+?)';/);
    if (match) {
        log.parse('Using format 2: Escaped string (var ytInitialData = \'...\')');
        
        const escapedJson = match[1];
        const json = escapedJson.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
        });
        log.success(`Extracted JSON: ${(json.length / 1024).toFixed(1)} KB (after unescaping)`);
        return JSON.parse(json);
    }

    throw new Error('Could not find ytInitialData in the response');
}

function findContinuationTokens(obj: any, tokens: string[] = []): string[] {
    if (!obj || typeof obj !== 'object') return tokens;
    
    if (obj.continuationCommand?.token) {
        tokens.push(obj.continuationCommand.token);
    }
    if (obj.continuation?.reloadContinuationData?.continuation) {
        tokens.push(obj.continuation.reloadContinuationData.continuation);
    }
    if (obj.token && typeof obj.token === 'string' && obj.token.length > 50) {
        tokens.push(obj.token);
    }
    
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object') {
            findContinuationTokens(obj[key], tokens);
        }
    }
    
    return tokens;
}

function findVideosTabData(data: any): VideosTabResult {
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    
    log.parse(`Found ${tabs.length} tabs: ${tabs.map((t: any) => t.tabRenderer?.title || t.expandableTabRenderer?.title || '?').join(', ')}`);
    
    for (const tab of tabs) {
        const tabRenderer = tab.tabRenderer;
        if (!tabRenderer) continue;
        
        const tabTitle = tabRenderer.title?.toLowerCase();
        const richGridRenderer = tabRenderer.content?.richGridRenderer;
        const sectionListRenderer = tabRenderer.content?.sectionListRenderer;
        
        if (tabTitle === 'videos' || richGridRenderer || sectionListRenderer) {
            const videos: Video[] = [];
            let continuationToken: string | null = null;
            
            if (richGridRenderer) {
                const contents = richGridRenderer.contents || [];
                
                for (const item of contents) {
                    const renderer = item.richItemRenderer?.content?.videoRenderer;
                    if (renderer) {
                        videos.push(extractVideoFromRenderer(renderer));
                    }
                    
                    if (item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
                        continuationToken = item.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
                    }
                }
            }
            
            if (sectionListRenderer) {
                const sections = sectionListRenderer.contents || [];
                for (const section of sections) {
                    const shelfRenderer = section.itemSectionRenderer?.contents?.[0]?.shelfRenderer;
                    const items = shelfRenderer?.content?.horizontalListRenderer?.items || [];
                    
                    for (const item of items) {
                        const renderer = item.gridVideoRenderer;
                        if (renderer) {
                            videos.push(extractVideoFromRenderer(renderer));
                        }
                    }
                }
            }
            
            if (videos.length > 0) {
                log.success(`Found ${videos.length} videos in "${tabRenderer.title}" tab`);
                return { videos, continuationToken, tabTitle: tabRenderer.title };
            }
        }
    }
    
    return { videos: [], continuationToken: null, tabTitle: null };
}

function findShortsTabData(data: any): ShortsTabResult {
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    
    for (const tab of tabs) {
        const tabRenderer = tab.tabRenderer;
        if (!tabRenderer) continue;
        
        const tabTitle = tabRenderer.title?.toLowerCase();
        if (tabTitle !== 'shorts') continue;
        
        const richGridRenderer = tabRenderer.content?.richGridRenderer;
        if (!richGridRenderer) continue;
        
        const shorts: Short[] = [];
        let continuationToken: string | null = null;
        const contents = richGridRenderer.contents || [];
        
        for (const item of contents) {
            const reelRenderer = item.richItemRenderer?.content?.reelItemRenderer;
            const shortsViewModel = item.richItemRenderer?.content?.shortsLockupViewModel;
            
            if (reelRenderer) {
                shorts.push({
                    videoId: reelRenderer.videoId,
                    title: reelRenderer.headline?.simpleText || reelRenderer.headline?.runs?.[0]?.text,
                    viewCount: reelRenderer.viewCountText?.simpleText,
                    isShort: true,
                });
            } else if (shortsViewModel) {
                const videoId = shortsViewModel.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ||
                    shortsViewModel.entityId?.replace('shorts-shelf-item-', '');
                shorts.push({
                    videoId: videoId,
                    title: shortsViewModel.overlayMetadata?.primaryText?.content,
                    viewCount: shortsViewModel.overlayMetadata?.secondaryText?.content,
                    isShort: true,
                });
            }
            
            if (item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
                continuationToken = item.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            }
        }
        
        if (shorts.length > 0) {
            log.success(`Found ${shorts.length} shorts in "${tabRenderer.title}" tab`);
            return { shorts, continuationToken };
        }
    }
    
    return { shorts: [], continuationToken: null };
}

function extractShortsFromBrowseResponse(data: any): BrowseShortsResult {
    const shorts: Short[] = [];
    let nextContinuationToken: string | null = null;
    
    const actions = data?.onResponseReceivedActions || data?.onResponseReceivedEndpoints || [];
    
    let continuationItems: any[] = [];
    for (const action of actions) {
        continuationItems = 
            action.appendContinuationItemsAction?.continuationItems ||
            action.reloadContinuationItemsCommand?.continuationItems ||
            [];
        if (continuationItems.length > 0) break;
    }
    
    for (const item of continuationItems) {
        if (item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
            nextContinuationToken = item.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            continue;
        }
        
        const reelRenderer = item.richItemRenderer?.content?.reelItemRenderer;
        const shortsViewModel = item.richItemRenderer?.content?.shortsLockupViewModel;
        
        if (reelRenderer) {
            shorts.push({
                videoId: reelRenderer.videoId,
                title: reelRenderer.headline?.simpleText || reelRenderer.headline?.runs?.[0]?.text,
                viewCount: reelRenderer.viewCountText?.simpleText,
                isShort: true,
            });
        } else if (shortsViewModel) {
            const videoId = shortsViewModel.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ||
                shortsViewModel.entityId?.replace('shorts-shelf-item-', '');
            shorts.push({
                videoId: videoId,
                title: shortsViewModel.overlayMetadata?.primaryText?.content,
                viewCount: shortsViewModel.overlayMetadata?.secondaryText?.content,
                isShort: true,
            });
        }
    }
    
    return { shorts, rawItemCount: continuationItems.length, nextContinuationToken };
}

function extractVideosFromBrowseResponse(data: any): BrowseVideosResult {
    const videos: Video[] = [];
    let nextContinuationToken: string | null = null;
    
    const actions = data?.onResponseReceivedActions || data?.onResponseReceivedEndpoints || [];
    
    let continuationItems: any[] = [];
    for (const action of actions) {
        continuationItems = 
            action.appendContinuationItemsAction?.continuationItems ||
            action.reloadContinuationItemsCommand?.continuationItems ||
            [];
        if (continuationItems.length > 0) break;
    }
    
    for (const item of continuationItems) {
        if (item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
            nextContinuationToken = item.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            continue;
        }
        
        let renderer = item.richItemRenderer?.content?.videoRenderer;
        
        if (!renderer) {
            renderer = item.gridVideoRenderer;
        }
        
        if (!renderer) {
            renderer = item.playlistVideoRenderer;
        }
        
        if (renderer) {
            videos.push(extractVideoFromRenderer(renderer));
        }
    }
    
    return { videos, rawItemCount: continuationItems.length, nextContinuationToken };
}

function extractVideosFromInitialData(data: any): Video[] {
    const videos: Video[] = [];
    
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    
    for (const tab of tabs) {
        const tabRenderer = tab.tabRenderer;
        if (!tabRenderer?.content) continue;
        
        const richGridRenderer = tabRenderer.content?.richGridRenderer;
        const sectionListRenderer = tabRenderer.content?.sectionListRenderer;
        
        const contents = richGridRenderer?.contents || 
            sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
        
        for (const item of contents) {
            const renderer = item.richItemRenderer?.content?.videoRenderer ||
                item.gridVideoRenderer ||
                item.videoRenderer;
            
            if (renderer) {
                videos.push(extractVideoFromRenderer(renderer));
            }
        }
    }
    
    return videos;
}

function extractChannelDetails(data: any): ChannelDetails {
    const metadata = data.metadata?.channelMetadataRenderer || {};
    const header = data.header?.c4TabbedHeaderRenderer || data.header?.pageHeaderRenderer || {};
    const microformat = data.microformat?.microformatDataRenderer || {};
    
    let subscriberCount: string | null = null;
    let videoCount: string | null = null;
    let viewCount: string | null = null;
    let joinDate: string | null = null;
    let country: string | null = null;
    let links: ChannelLink[] = [];
    let aboutContinuationToken: string | null = null;
    
    subscriberCount = header.subscriberCountText?.simpleText;
    
    const headerContent = header.content?.pageHeaderViewModel;
    if (headerContent) {
        const metadataRows = headerContent.metadata?.contentMetadataViewModel?.metadataRows || [];
        for (const row of metadataRows) {
            const parts = row.metadataParts || [];
            for (const part of parts) {
                const text = part.text?.content || '';
                if (text.includes('subscriber')) subscriberCount = subscriberCount || text;
                if (text.includes('video') && !text.includes('view')) videoCount = videoCount || text;
            }
        }
        
        const descPanel = headerContent.description?.descriptionPreviewViewModel?.rendererContext?.commandContext?.onTap?.innertubeCommand?.showEngagementPanelEndpoint;
        if (descPanel) {
            const contents = descPanel.engagementPanel?.engagementPanelSectionListRenderer?.content?.sectionListRenderer?.contents || [];
            for (const content of contents) {
                const token = content.itemSectionRenderer?.contents?.[0]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
                if (token) {
                    aboutContinuationToken = token;
                }
            }
        }
    }
    
    const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    for (const tab of tabs) {
        const sectionContents = tab.tabRenderer?.content?.sectionListRenderer?.contents || [];
        for (const section of sectionContents) {
            const itemSection = section.itemSectionRenderer?.contents?.[0];
            
            const aboutRenderer = itemSection?.channelAboutFullMetadataRenderer;
            if (aboutRenderer) {
                viewCount = viewCount || aboutRenderer.viewCountText?.simpleText;
                joinDate = joinDate || aboutRenderer.joinedDateText?.runs?.map((r: any) => r.text).join('');
                country = country || aboutRenderer.country?.simpleText;
                videoCount = videoCount || aboutRenderer.videoCountText?.simpleText;
            }
            
            const aboutChannelRenderer = itemSection?.aboutChannelRenderer;
            if (aboutChannelRenderer) {
                const aboutView = aboutChannelRenderer.metadata?.aboutChannelViewModel;
                if (aboutView) {
                    viewCount = viewCount || aboutView.viewCountText;
                    joinDate = joinDate || aboutView.joinedDateText?.content;
                    country = country || aboutView.country;
                    videoCount = videoCount || aboutView.videoCountText;
                    subscriberCount = subscriberCount || aboutView.subscriberCountText;
                    
                    const linkSection = aboutView.links || [];
                    for (const link of linkSection) {
                        const channelLink = link.channelExternalLinkViewModel;
                        if (channelLink) {
                            links.push({
                                title: channelLink.title?.content,
                                url: channelLink.link?.content
                            });
                        }
                    }
                }
            }
        }
    }
    
    return {
        title: metadata.title || header.pageTitle,
        description: metadata.description,
        vanityUrl: metadata.vanityChannelUrl,
        channelUrl: metadata.channelUrl,
        externalId: metadata.externalId,
        keywords: metadata.keywords,
        avatar: metadata.avatar?.thumbnails?.[0]?.url || header.avatar?.thumbnails?.[0]?.url,
        banner: header.banner?.thumbnails?.[0]?.url,
        subscriberCount,
        videoCount,
        viewCount,
        joinDate,
        country,
        links,
        aboutContinuationToken,
        familyFriendly: microformat.familySafe,
        tags: microformat.tags,
    };
}

function extractAboutDetails(data: any): ExtendedDetails {
    const details: ExtendedDetails = {
        viewCount: null,
        joinDate: null,
        country: null,
        links: []
    };
    
    const actions = data?.onResponseReceivedEndpoints || data?.onResponseReceivedActions || [];
    
    for (const action of actions) {
        const items = action.appendContinuationItemsAction?.continuationItems || [];
        for (const item of items) {
            const aboutView = item.aboutChannelRenderer?.metadata?.aboutChannelViewModel;
            if (aboutView) {
                details.viewCount = aboutView.viewCountText;
                details.joinDate = aboutView.joinedDateText?.content;
                details.country = aboutView.country;
                
                const linkSection = aboutView.links || [];
                for (const link of linkSection) {
                    const channelLink = link.channelExternalLinkViewModel;
                    if (channelLink) {
                        details.links.push({
                            title: channelLink.title?.content,
                            url: channelLink.link?.content
                        });
                    }
                }
            }
        }
    }
    
    return details;
}

function generateHtmlPage(channels: ChannelData[], outputPath: string): string {
    const escapeHtml = (str: string | undefined | null): string => {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const formatNumber = (str: string | undefined | null): string => {
        if (!str) return 'N/A';
        return str;
    };

    const calculateActualDate = (relativeTime: string | undefined): string | null => {
        if (!relativeTime) return null;
        const str = relativeTime.toLowerCase();
        const match = str.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/);
        if (!match) return null;
        
        const num = parseInt(match[1], 10);
        const unit = match[2];
        const now = new Date();
        
        switch (unit) {
            case 'second': now.setSeconds(now.getSeconds() - num); break;
            case 'minute': now.setMinutes(now.getMinutes() - num); break;
            case 'hour': now.setHours(now.getHours() - num); break;
            case 'day': now.setDate(now.getDate() - num); break;
            case 'week': now.setDate(now.getDate() - num * 7); break;
            case 'month': now.setMonth(now.getMonth() - num); break;
            case 'year': now.setFullYear(now.getFullYear() - num); break;
        }
        
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        return `~${dateStr} (approximate)`;
    };

    const allVideos: Video[] = [];
    const allShorts: Video[] = [];
    const seenVideoIds = new Set<string>();
    const seenShortIds = new Set<string>();
    
    channels.forEach((ch, channelIndex) => {
        ch.videos.forEach(v => {
            const videoWithChannel = {
                ...v,
                channelTitle: ch.channel.title,
                channelIndex,
            };
            if (v.isShort) {
                if (!seenShortIds.has(v.videoId)) {
                    seenShortIds.add(v.videoId);
                    allShorts.push(videoWithChannel);
                }
            } else {
                if (!seenVideoIds.has(v.videoId)) {
                    seenVideoIds.add(v.videoId);
                    allVideos.push(videoWithChannel);
                }
            }
        });
    });

    const isMultiChannel = channels.length > 1;
    
    const channelColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe'];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${isMultiChannel ? 'Multi-Channel View' : escapeHtml(channels[0]?.channel.title)} - YouTube Channel</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .channel-header {
            background: linear-gradient(135deg, #2d3436 0%, #1e272e 100%);
            border-radius: 16px;
            padding: 40px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .channel-title {
            font-size: 3rem;
            font-weight: 700;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .channel-stats {
            display: flex;
            flex-wrap: wrap;
            gap: 30px;
            margin-bottom: 25px;
        }
        
        .stat-item {
            background: rgba(255,255,255,0.15);
            padding: 15px 25px;
            border-radius: 12px;
            backdrop-filter: blur(10px);
        }
        
        .stat-label {
            font-size: 0.85rem;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .stat-value {
            font-size: 1.4rem;
            font-weight: 600;
        }
        
        .channel-description {
            background: rgba(0,0,0,0.2);
            padding: 20px;
            border-radius: 12px;
            white-space: pre-wrap;
            font-size: 0.95rem;
            line-height: 1.8;
        }
        
        .channel-links {
            margin-top: 20px;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .channel-link {
            background: rgba(255,255,255,0.2);
            color: #fff;
            padding: 8px 16px;
            border-radius: 20px;
            text-decoration: none;
            font-size: 0.9rem;
            transition: all 0.3s ease;
        }
        
        .channel-link:hover {
            background: rgba(255,255,255,0.3);
            transform: translateY(-2px);
        }
        
        .videos-section {
            margin-top: 40px;
        }
        
        .section-title {
            font-size: 2rem;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .video-count {
            background: #ff0000;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 1rem;
        }
        
        .videos-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 25px;
        }
        
        .video-card {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.3s ease;
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .video-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.4);
            border-color: rgba(255,0,0,0.5);
        }
        
        .video-thumbnail {
            position: relative;
            width: 100%;
            aspect-ratio: 16/9;
            background: #000;
        }
        
        .video-thumbnail img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .video-duration {
            position: absolute;
            bottom: 8px;
            right: 8px;
            background: rgba(0,0,0,0.85);
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 0.85rem;
            font-weight: 500;
        }
        
        .video-info {
            padding: 15px;
        }
        
        .video-title {
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 10px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        
        .video-title a {
            color: #fff;
            text-decoration: none;
        }
        
        .video-title a:hover {
            color: #ff6b6b;
        }
        
        .video-meta {
            font-size: 0.85rem;
            color: rgba(255,255,255,0.6);
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
        }
        
        .video-meta span {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .video-description {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid rgba(255,255,255,0.1);
        }
        
        .video-description-toggle {
            background: none;
            border: none;
            color: rgba(255,255,255,0.7);
            cursor: pointer;
            font-size: 0.8rem;
            padding: 5px 0;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: color 0.2s;
        }
        
        .video-description-toggle:hover {
            color: #fff;
        }
        
        .video-description-content {
            display: none;
            margin-top: 10px;
            padding: 12px;
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            font-size: 0.85rem;
            line-height: 1.6;
            color: rgba(255,255,255,0.8);
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .video-description-content.expanded {
            display: block;
        }
        
        .video-description-content::-webkit-scrollbar {
            width: 6px;
        }
        
        .video-description-content::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.05);
            border-radius: 3px;
        }
        
        .video-description-content::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.2);
            border-radius: 3px;
        }
        
        .video-description-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255,255,255,0.3);
        }
        
        .footer {
            text-align: center;
            padding: 40px 20px;
            opacity: 0.6;
            font-size: 0.9rem;
        }
        
        .controls {
            margin-bottom: 25px;
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }
        
        .search-box {
            flex: 1;
            min-width: 250px;
            padding: 12px 20px;
            border-radius: 25px;
            border: 2px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 1rem;
            outline: none;
            transition: all 0.3s ease;
        }
        
        .search-box:focus {
            border-color: #ff0000;
            background: rgba(255,255,255,0.1);
        }
        
        .search-box::placeholder {
            color: rgba(255,255,255,0.5);
        }
        
        .sort-buttons {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .sort-btn {
            padding: 10px 18px;
            border-radius: 20px;
            border: 2px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .sort-btn:hover {
            background: rgba(255,255,255,0.15);
            border-color: rgba(255,255,255,0.3);
        }
        
        .sort-btn.active {
            background: #ff0000;
            border-color: #ff0000;
        }
        
        .sort-btn .sort-icon {
            font-size: 0.8rem;
            opacity: 0.7;
        }
        
        .sort-btn.active .sort-icon {
            opacity: 1;
        }
        
        @media (max-width: 768px) {
            .channel-title {
                font-size: 2rem;
            }
            
            .channel-stats {
                gap: 15px;
            }
            
            .stat-item {
                padding: 10px 15px;
            }
            
            .videos-grid {
                grid-template-columns: 1fr;
            }
            
            .shorts-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        
        .shorts-section {
            margin-top: 50px;
        }
        
        .shorts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 20px;
        }
        
        .short-card {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.3s ease;
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .short-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.4);
            border-color: rgba(255,0,200,0.5);
        }
        
        .short-thumbnail {
            position: relative;
            width: 100%;
            aspect-ratio: 9/16;
            background: #000;
        }
        
        .short-thumbnail img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .short-badge {
            position: absolute;
            top: 8px;
            left: 8px;
            background: linear-gradient(135deg, #ff0050 0%, #ff0000 100%);
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .short-info {
            padding: 12px;
        }
        
        .short-title {
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 8px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            line-height: 1.3;
        }
        
        .short-title a {
            color: #fff;
            text-decoration: none;
        }
        
        .short-title a:hover {
            color: #ff6b6b;
        }
        
        .short-meta {
            font-size: 0.8rem;
            color: rgba(255,255,255,0.6);
        }
        
        .section-count {
            background: #ff0000;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 1rem;
        }
        
        .section-count.shorts {
            background: linear-gradient(135deg, #ff0050 0%, #ff0000 100%);
        }
        
        .content-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 25px;
        }
        
        .tab-btn {
            padding: 10px 25px;
            border-radius: 25px;
            border: 2px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .tab-btn:hover {
            background: rgba(255,255,255,0.1);
        }
        
        .tab-btn.active {
            background: #ff0000;
            border-color: #ff0000;
        }
        
        .tab-btn.active.shorts {
            background: linear-gradient(135deg, #ff0050 0%, #ff0000 100%);
            border-color: #ff0050;
        }
        
        .channel-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 25px;
            flex-wrap: wrap;
        }
        
        .channel-tab {
            padding: 12px 24px;
            border-radius: 25px;
            border: 2px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .channel-tab:hover {
            background: rgba(255,255,255,0.1);
        }
        
        .channel-tab.active {
            background: rgba(255,255,255,0.15);
            border-color: var(--channel-color, #ff0000);
        }
        
        .channel-tab .channel-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--channel-color, #ff0000);
        }
        
        .channel-indicator {
            position: absolute;
            top: 8px;
            left: 8px;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            background: var(--channel-color, #ff0000);
            color: #fff;
            max-width: 80%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            z-index: 1;
        }
        
        .multi-channel-header {
            background: linear-gradient(135deg, #2d3436 0%, #1e272e 100%);
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .multi-channel-title {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 15px;
        }
        
        .multi-channel-summary {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .summary-stat {
            background: rgba(255,255,255,0.1);
            padding: 12px 20px;
            border-radius: 10px;
        }
        
        .summary-stat-label {
            font-size: 0.8rem;
            opacity: 0.7;
            text-transform: uppercase;
        }
        
        .summary-stat-value {
            font-size: 1.3rem;
            font-weight: 600;
        }
        
        .channel-header-row {
            display: none;
            transition: all 0.3s ease;
        }
        
        .channel-header-row.active {
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        ${isMultiChannel ? `
        <header class="multi-channel-header">
            <h1 class="multi-channel-title">📺 Multi-Channel View</h1>
            <div class="multi-channel-summary">
                <div class="summary-stat">
                    <div class="summary-stat-label">📺 Channels</div>
                    <div class="summary-stat-value">${channels.length}</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-label">🎬 Videos</div>
                    <div class="summary-stat-value">${allVideos.length}</div>
                </div>
                ${allShorts.length > 0 ? `
                <div class="summary-stat">
                    <div class="summary-stat-label">📱 Shorts</div>
                    <div class="summary-stat-value">${allShorts.length}</div>
                </div>
                ` : ''}
            </div>
            
            <div class="channel-tabs" id="channelTabs">
                <button class="channel-tab active" data-channel="all" style="--channel-color: #fff;">
                    <span class="channel-dot"></span>
                    All Channels
                </button>
                ${channels.map((ch, idx) => `
                <button class="channel-tab" data-channel="${idx}" style="--channel-color: ${channelColors[idx % channelColors.length]};">
                    <span class="channel-dot"></span>
                    ${escapeHtml(ch.channel.title)}
                </button>
                `).join('')}
            </div>
        </header>
        
        ${channels.map((ch, idx) => `
        <div class="channel-header-row" data-channel-header="${idx}">
            <header class="channel-header">
                <h1 class="channel-title">📺 ${escapeHtml(ch.channel.title)}</h1>
                
                <div class="channel-stats">
                    ${ch.channel.subscriberCount ? `<div class="stat-item"><div class="stat-label">👥 Subscribers</div><div class="stat-value">${escapeHtml(ch.channel.subscriberCount)}</div></div>` : ''}
                    ${ch.channel.videoCount ? `<div class="stat-item"><div class="stat-label">🎬 Videos</div><div class="stat-value">${escapeHtml(ch.channel.videoCount)}</div></div>` : ''}
                    ${ch.channel.viewCount ? `<div class="stat-item"><div class="stat-label">👁️ Total Views</div><div class="stat-value">${escapeHtml(ch.channel.viewCount)}</div></div>` : ''}
                    ${ch.channel.joinDate ? `<div class="stat-item"><div class="stat-label">📅 Joined</div><div class="stat-value">${escapeHtml(ch.channel.joinDate.replace('Joined ', ''))}</div></div>` : ''}
                    ${ch.channel.country ? `<div class="stat-item"><div class="stat-label">🌍 Country</div><div class="stat-value">${escapeHtml(ch.channel.country)}</div></div>` : ''}
                </div>
                
                ${ch.channel.links && ch.channel.links.length > 0 ? `
                <div class="channel-links">
                    ${ch.channel.links.map(link => `<a href="https://${escapeHtml(link.url)}" target="_blank" rel="noopener" class="channel-link">🔗 ${escapeHtml(link.title || link.url)}</a>`).join('')}
                </div>
                ` : ''}
                
                ${ch.channel.description ? `<div class="channel-description">${escapeHtml(ch.channel.description)}</div>` : ''}
            </header>
        </div>
        `).join('')}
        ` : `
        <header class="channel-header">
            <h1 class="channel-title">📺 ${escapeHtml(channels[0].channel.title)}</h1>
            
            <div class="channel-stats">
                ${channels[0].channel.subscriberCount ? `<div class="stat-item"><div class="stat-label">👥 Subscribers</div><div class="stat-value">${escapeHtml(channels[0].channel.subscriberCount)}</div></div>` : ''}
                ${channels[0].channel.videoCount ? `<div class="stat-item"><div class="stat-label">🎬 Videos</div><div class="stat-value">${escapeHtml(channels[0].channel.videoCount)}</div></div>` : ''}
                ${channels[0].channel.viewCount ? `<div class="stat-item"><div class="stat-label">👁️ Total Views</div><div class="stat-value">${escapeHtml(channels[0].channel.viewCount)}</div></div>` : ''}
                ${channels[0].channel.joinDate ? `<div class="stat-item"><div class="stat-label">📅 Joined</div><div class="stat-value">${escapeHtml(channels[0].channel.joinDate.replace('Joined ', ''))}</div></div>` : ''}
                ${channels[0].channel.country ? `<div class="stat-item"><div class="stat-label">🌍 Country</div><div class="stat-value">${escapeHtml(channels[0].channel.country)}</div></div>` : ''}
            </div>
            
            ${channels[0].channel.links && channels[0].channel.links.length > 0 ? `
            <div class="channel-links">
                ${channels[0].channel.links.map(link => `<a href="https://${escapeHtml(link.url)}" target="_blank" rel="noopener" class="channel-link">🔗 ${escapeHtml(link.title || link.url)}</a>`).join('')}
            </div>
            ` : ''}
            
            ${channels[0].channel.description ? `<div class="channel-description">${escapeHtml(channels[0].channel.description)}</div>` : ''}
        </header>
        `}
        
        <section class="videos-section" id="videosSection">
            <h2 class="section-title">
                🎬 Videos
                <span class="section-count">${allVideos.length}</span>
            </h2>
            
            <div class="controls">
                <input type="text" class="search-box" placeholder="🔍 Search videos..." id="searchBox">
                <div class="sort-buttons">
                    <button class="sort-btn active" data-sort="default" data-order="desc">
                        <span>Default</span>
                    </button>
                    <button class="sort-btn" data-sort="views" data-order="desc">
                        <span>👁️ Views</span>
                        <span class="sort-icon">▼</span>
                    </button>
                    <button class="sort-btn" data-sort="date" data-order="desc">
                        <span>📅 Date</span>
                        <span class="sort-icon">▼</span>
                    </button>
                    <button class="sort-btn" data-sort="duration" data-order="desc">
                        <span>⏱️ Duration</span>
                        <span class="sort-icon">▼</span>
                    </button>
                    <button class="sort-btn" data-sort="title" data-order="asc">
                        <span>🔤 Title</span>
                        <span class="sort-icon">▲</span>
                    </button>
                </div>
            </div>
            
            <div class="videos-grid" id="videosGrid">
                ${allVideos.map((video, index) => `
                <article class="video-card" data-title="${escapeHtml(video.title?.toLowerCase() || '')}" data-views="${escapeHtml(video.viewCount || '0')}" data-date="${escapeHtml(video.publishedTime || '')}" data-exact-date="${escapeHtml(video.publishDate || '')}" data-duration="${escapeHtml(video.duration || '0:00')}" data-index="${index}" data-channel="${video.channelIndex}">
                    <div class="video-thumbnail">
                        ${isMultiChannel ? `<span class="channel-indicator" style="--channel-color: ${channelColors[(video.channelIndex ?? 0) % channelColors.length]};">${escapeHtml(video.channelTitle)}</span>` : ''}
                        <a href="https://www.youtube.com/watch?v=${escapeHtml(video.videoId)}" target="_blank" rel="noopener">
                            <img src="https://i.ytimg.com/vi/${escapeHtml(video.videoId)}/mqdefault.jpg" alt="${escapeHtml(video.title)}" loading="lazy">
                        </a>
                        ${video.duration ? `<span class="video-duration">${escapeHtml(video.duration)}</span>` : ''}
                    </div>
                    <div class="video-info">
                        <h3 class="video-title">
                            <a href="https://www.youtube.com/watch?v=${escapeHtml(video.videoId)}" target="_blank" rel="noopener">
                                ${escapeHtml(video.title)}
                            </a>
                        </h3>
                        <div class="video-meta">
                            ${video.viewCount ? `<span>👁️ ${escapeHtml(video.viewCount)}</span>` : ''}
                            ${video.publishDate 
                                ? `<span>📅 ${escapeHtml(video.publishDate)}${video.publishedTime ? ` (${escapeHtml(video.publishedTime)})` : ''}</span>` 
                                : (video.publishedTime ? `<span title="${escapeHtml(calculateActualDate(video.publishedTime) || video.publishedTime)}">📅 ${escapeHtml(video.publishedTime)}</span>` : '')}
                        </div>
                        ${video.description ? `
                        <div class="video-description">
                            <button class="video-description-toggle" onclick="this.nextElementSibling.classList.toggle('expanded'); this.querySelector('.toggle-icon').textContent = this.nextElementSibling.classList.contains('expanded') ? '▲' : '▼';">
                                <span class="toggle-icon">▼</span> Description
                            </button>
                            <div class="video-description-content">${escapeHtml(video.description)}</div>
                        </div>
                        ` : ''}
                    </div>
                </article>
                `).join('')}
            </div>
        </section>
        
        ${allShorts.length > 0 ? `
        <section class="shorts-section" id="shortsSection">
            <h2 class="section-title">
                📱 Shorts
                <span class="section-count shorts">${allShorts.length}</span>
            </h2>
            
            <div class="controls">
                <input type="text" class="search-box" placeholder="🔍 Search shorts..." id="searchBoxShorts">
            </div>
            
            <div class="shorts-grid" id="shortsGrid">
                ${allShorts.map(short => `
                <article class="short-card" data-title="${escapeHtml(short.title?.toLowerCase() || '')}" data-channel="${short.channelIndex}">
                    <div class="short-thumbnail">
                        ${isMultiChannel ? `<span class="channel-indicator" style="--channel-color: ${channelColors[(short.channelIndex ?? 0) % channelColors.length]}; top: 35px;">${escapeHtml(short.channelTitle)}</span>` : ''}
                        <a href="https://www.youtube.com/shorts/${escapeHtml(short.videoId)}" target="_blank" rel="noopener">
                            <img src="https://i.ytimg.com/vi/${escapeHtml(short.videoId)}/oar2.jpg" alt="${escapeHtml(short.title)}" loading="lazy">
                        </a>
                        <span class="short-badge">Short</span>
                    </div>
                    <div class="short-info">
                        <h3 class="short-title">
                            <a href="https://www.youtube.com/shorts/${escapeHtml(short.videoId)}" target="_blank" rel="noopener">
                                ${escapeHtml(short.title || 'Untitled Short')}
                            </a>
                        </h3>
                        <div class="short-meta">
                            ${short.viewCount ? `<span>👁️ ${escapeHtml(short.viewCount)}</span>` : ''}
                        </div>
                    </div>
                </article>
                `).join('')}
            </div>
        </section>
        ` : ''}
        
        <footer class="footer">
            <p>Generated on ${new Date().toLocaleString()} • ${allVideos.length} videos${allShorts.length > 0 ? ` • ${allShorts.length} shorts` : ''}${isMultiChannel ? ` • ${channels.length} channels` : ''}</p>
            <p>Data fetched from YouTube</p>
        </footer>
    </div>
    
    <script>
        const searchBox = document.getElementById('searchBox');
        const videosGrid = document.getElementById('videosGrid');
        const videoCards = videosGrid?.querySelectorAll('.video-card') || [];
        
        const searchBoxShorts = document.getElementById('searchBoxShorts');
        const shortsGrid = document.getElementById('shortsGrid');
        const shortCards = shortsGrid?.querySelectorAll('.short-card') || [];
        
        const sortButtons = document.querySelectorAll('.sort-btn');
        
        function parseViews(viewStr) {
            if (!viewStr) return 0;
            const str = viewStr.toLowerCase().replace(/,/g, '');
            const fullMatch = str.match(/^([\\d]+)/);
            if (fullMatch) {
                return parseInt(fullMatch[1]);
            }
            const abbrMatch = str.match(/([\\d.]+)\\s*(k|m|b)/);
            if (abbrMatch) {
                let num = parseFloat(abbrMatch[1]);
                const suffix = abbrMatch[2];
                if (suffix === 'k') num *= 1000;
                else if (suffix === 'm') num *= 1000000;
                else if (suffix === 'b') num *= 1000000000;
                return num;
            }
            return 0;
        }
        
        function parseDuration(durStr) {
            if (!durStr) return 0;
            const parts = durStr.split(':').map(Number);
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            return parts[0] || 0;
        }
        
        function parseDateAge(dateStr) {
            if (!dateStr) return Infinity;
            const str = dateStr.toLowerCase();
            const match = str.match(/(\\d+)\\s*(second|minute|hour|day|week|month|year)s?/);
            if (!match) return Infinity;
            const num = parseInt(match[1]);
            const unit = match[2];
            const multipliers = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
            return num * (multipliers[unit] || 1);
        }
        
        function parseExactDate(dateStr) {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return null;
            return date.getTime();
        }
        
        function sortVideos(sortBy, order) {
            const cardsArray = Array.from(videoCards);
            
            cardsArray.sort((a, b) => {
                let valA, valB;
                
                switch (sortBy) {
                    case 'views':
                        valA = parseViews(a.dataset.views);
                        valB = parseViews(b.dataset.views);
                        break;
                    case 'duration':
                        valA = parseDuration(a.dataset.duration);
                        valB = parseDuration(b.dataset.duration);
                        break;
                    case 'date':
                        const exactA = parseExactDate(a.dataset.exactDate);
                        const exactB = parseExactDate(b.dataset.exactDate);
                        if (exactA !== null && exactB !== null) {
                            valA = -exactA;
                            valB = -exactB;
                        } else if (exactA !== null) {
                            valA = 0;
                            valB = parseDateAge(b.dataset.date);
                        } else if (exactB !== null) {
                            valA = parseDateAge(a.dataset.date);
                            valB = 0;
                        } else {
                            valA = parseDateAge(a.dataset.date);
                            valB = parseDateAge(b.dataset.date);
                        }
                        break;
                    case 'title':
                        valA = a.dataset.title || '';
                        valB = b.dataset.title || '';
                        return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                    default:
                        valA = parseInt(a.dataset.index);
                        valB = parseInt(b.dataset.index);
                }
                
                return order === 'asc' ? valA - valB : valB - valA;
            });
            
            cardsArray.forEach(card => videosGrid.appendChild(card));
        }
        
        sortButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const sortBy = btn.dataset.sort;
                let order = btn.dataset.order;
                
                if (btn.classList.contains('active') && sortBy !== 'default') {
                    order = order === 'asc' ? 'desc' : 'asc';
                    btn.dataset.order = order;
                    const icon = btn.querySelector('.sort-icon');
                    if (icon) icon.textContent = order === 'asc' ? '▲' : '▼';
                }
                
                sortButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                sortVideos(sortBy, order);
            });
        });
        
        const channelTabs = document.querySelectorAll('.channel-tab');
        const channelHeaders = document.querySelectorAll('.channel-header-row');
        let activeChannel = 'all';
        
        function filterByChannel(channelFilter) {
            activeChannel = channelFilter;
            
            videoCards.forEach(card => {
                const cardChannel = card.dataset.channel;
                const matchesSearch = searchBox.value.toLowerCase().trim() === '' || 
                    (card.dataset.title || '').includes(searchBox.value.toLowerCase().trim());
                const matchesChannel = channelFilter === 'all' || cardChannel === channelFilter;
                card.style.display = matchesSearch && matchesChannel ? '' : 'none';
            });
            
            shortCards.forEach(card => {
                const cardChannel = card.dataset.channel;
                const matchesSearch = searchBoxShorts?.value.toLowerCase().trim() === '' || 
                    (card.dataset.title || '').includes(searchBoxShorts?.value.toLowerCase().trim());
                const matchesChannel = channelFilter === 'all' || cardChannel === channelFilter;
                card.style.display = matchesSearch && matchesChannel ? '' : 'none';
            });
            
            channelHeaders.forEach(header => {
                const headerChannel = header.dataset.channelHeader;
                if (channelFilter === 'all') {
                    header.classList.remove('active');
                } else if (headerChannel === channelFilter) {
                    header.classList.add('active');
                } else {
                    header.classList.remove('active');
                }
            });
        }
        
        channelTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                channelTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                filterByChannel(tab.dataset.channel);
            });
        });
        
        if (searchBox) {
            searchBox.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                
                videoCards.forEach(card => {
                    const title = card.dataset.title || '';
                    const cardChannel = card.dataset.channel;
                    const matchesSearch = query === '' || title.includes(query);
                    const matchesChannel = activeChannel === 'all' || cardChannel === activeChannel;
                    card.style.display = matchesSearch && matchesChannel ? '' : 'none';
                });
            });
        }
        
        if (searchBoxShorts) {
            searchBoxShorts.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                
                shortCards.forEach(card => {
                    const title = card.dataset.title || '';
                    const cardChannel = card.dataset.channel;
                    const matchesSearch = query === '' || title.includes(query);
                    const matchesChannel = activeChannel === 'all' || cardChannel === activeChannel;
                    card.style.display = matchesSearch && matchesChannel ? '' : 'none';
                });
            });
        }
    </script>
</body>
</html>`;

    fs.writeFileSync(outputPath, html, 'utf8');
    return outputPath;
}

async function processChannel(channelInput: string, index: number, total: number): Promise<ChannelData> {
    const { channelIdentifier, channelUrl, channelShortsUrl, channelStreamsUrl, channelAboutUrl } = getChannelUrls(channelInput);
    
    log.header(`📺 CHANNEL ${index + 1}/${total}: ${channelIdentifier}`);
    
    const aboutHtml = await fetchChannelPage(channelAboutUrl);
    const aboutData = extractYtInitialData(aboutHtml);
    log.success('Parsed About page data');

    const channel = extractChannelDetails(aboutData);
    
    if (channel.aboutContinuationToken) {
        log.fetch('Fetching extended channel details...');
        const extendedData = await fetchBrowseData(channel.aboutContinuationToken, channelAboutUrl);
        const extended = extractAboutDetails(extendedData);
        
        channel.viewCount = channel.viewCount || extended.viewCount;
        channel.joinDate = channel.joinDate || extended.joinDate;
        channel.country = channel.country || extended.country;
        if (extended.links.length > 0) {
            channel.links = extended.links;
        }
        log.success('Extended details loaded');
    }
    
    if (channel.title) {
        console.log(`   ${colors.bright}${channel.title}${colors.reset}`);
        if (channel.vanityUrl) log.detail('🔗 URL', channel.vanityUrl);
        if (channel.country) log.detail('🌍 Country', channel.country);
        if (channel.joinDate) log.detail('📅 Joined', channel.joinDate);
        if (channel.subscriberCount) log.detail('👥 Subscribers', channel.subscriberCount);
        if (channel.videoCount) log.detail('🎬 Videos', channel.videoCount);
        if (channel.viewCount) log.detail('👁️  Views', channel.viewCount);
    }

    console.log();
    const html = await fetchChannelPage(channelUrl);
    const data = extractYtInitialData(html);
    log.success('Parsed Videos page data');

    const { videos: initialVideos, continuationToken } = findVideosTabData(data);
    
    if (initialVideos.length > 0) {
        log.info(`Found ${initialVideos.length} videos from initial page`);
    } else {
        log.warn('No videos found in Videos tab');
    }

    const allVideos: Video[] = [...initialVideos.filter(v => !isVideoTooOld(v.publishedTime) && !isVideoTooShort(v.duration))];
    let currentToken = continuationToken;
    let pageNumber = 1;
    let reachedAgeLimit = false;
    
    if (initialVideos.length > 0 && allVideos.length < initialVideos.length) {
        reachedAgeLimit = true;
        log.info(`Age limit reached (${MAX_VIDEO_AGE_DAYS} days) - some initial videos filtered`);
    }
    
    while (currentToken && allVideos.length < VIDEO_LIMIT && !reachedAgeLimit) {
        const limitInfo = MAX_VIDEO_AGE_DAYS === Infinity 
            ? `${allVideos.length}/${VIDEO_LIMIT}` 
            : `${allVideos.length}/${VIDEO_LIMIT} (max age: ${MAX_VIDEO_AGE_DAYS}d)`;
        log.info(`Loading more videos (Page ${pageNumber}), progress: ${limitInfo}`);
        
        const browseData = await fetchBrowseData(currentToken, channelUrl);
        const { videos: moreVideos, nextContinuationToken } = extractVideosFromBrowseResponse(browseData);
        
        if (moreVideos.length === 0) {
            log.warn('No more videos found');
            break;
        }
        
        for (const video of moreVideos) {
            if (allVideos.length >= VIDEO_LIMIT) break;
            if (isVideoTooOld(video.publishedTime)) {
                reachedAgeLimit = true;
                log.info(`Age limit reached (${MAX_VIDEO_AGE_DAYS} days) at: ${video.publishedTime}`);
                break;
            }
            if (isVideoTooShort(video.duration)) continue;
            allVideos.push(video);
        }
        
        currentToken = nextContinuationToken;
        pageNumber++;
        
        if (!currentToken) {
            log.info('No more pages available');
        }
    }
    
    const stopReason = reachedAgeLimit ? ' (age limit)' : (allVideos.length >= VIDEO_LIMIT ? ' (count limit)' : '');
    log.success(`Videos fetched: ${allVideos.length}${stopReason}`);

    if (MAX_VIDEO_AGE_DAYS !== Infinity && allVideos.length < VIDEO_LIMIT) {
        log.info(`Fetching Streams (same limits as videos)...`);
        try {
            const streamsHtml = await fetchChannelPage(channelStreamsUrl);
            const streamsData = extractYtInitialData(streamsHtml);
            
            const streamsTabs = streamsData?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
            let streamsTabData: VideosTabResult | null = null;
            
            for (const tab of streamsTabs) {
                const tabRenderer = tab.tabRenderer;
                if (!tabRenderer) continue;
                
                const tabTitle = tabRenderer.title?.toLowerCase();
                const isSelected = tabRenderer.selected === true;
                
                if (isSelected || tabTitle === 'live') {
                    const richGridRenderer = tabRenderer.content?.richGridRenderer;
                    if (richGridRenderer) {
                        const contents = richGridRenderer.contents || [];
                        const videos: Video[] = [];
                        let continuationToken: string | null = null;
                        
                        for (const item of contents) {
                            const renderer = item.richItemRenderer?.content?.videoRenderer;
                            if (renderer) {
                                videos.push(extractVideoFromRenderer(renderer));
                            }
                            if (item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
                                continuationToken = item.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
                            }
                        }
                        
                        if (videos.length > 0) {
                            log.success(`Found ${videos.length} streams in "${tabRenderer.title}" tab`);
                            streamsTabData = { videos, continuationToken };
                            break;
                        }
                    }
                }
            }
            
            if (!streamsTabData) {
                streamsTabData = findVideosTabData(streamsData);
            }
            
            const { videos: initialStreams, continuationToken: streamsContinuationToken } = streamsTabData;
            
            let streamsAdded = 0;
            let streamsSkipped = 0;
            for (const stream of initialStreams) {
                if (allVideos.length >= VIDEO_LIMIT) break;
                if (isUpcomingStream(stream.publishedTime)) {
                    streamsSkipped++;
                    continue;
                }
                if (isVideoTooOld(stream.publishedTime)) {
                    reachedAgeLimit = true;
                    break;
                }
                if (isVideoTooShort(stream.duration)) continue;
                stream.isStream = true;
                allVideos.push(stream);
                streamsAdded++;
            }
            
            if (streamsSkipped > 0) {
                log.info(`Skipped ${streamsSkipped} upcoming/scheduled streams`);
            }
            
            let streamsToken = streamsContinuationToken;
            let streamsPage = 1;
            
            while (streamsToken && allVideos.length < VIDEO_LIMIT && !reachedAgeLimit) {
                log.info(`Loading more streams (Page ${streamsPage})...`);
                
                const browseData = await fetchBrowseData(streamsToken, channelStreamsUrl);
                const { videos: moreStreams, nextContinuationToken } = extractVideosFromBrowseResponse(browseData);
                
                if (moreStreams.length === 0) break;
                
                for (const stream of moreStreams) {
                    if (allVideos.length >= VIDEO_LIMIT) break;
                    if (isUpcomingStream(stream.publishedTime)) {
                        streamsSkipped++;
                        continue;
                    }
                    if (isVideoTooOld(stream.publishedTime)) {
                        reachedAgeLimit = true;
                        break;
                    }
                    if (isVideoTooShort(stream.duration)) continue;
                    stream.isStream = true;
                    allVideos.push(stream);
                    streamsAdded++;
                }
                
                streamsToken = nextContinuationToken;
                streamsPage++;
            }
            
            if (streamsAdded > 0) {
                log.success(`Streams added: ${streamsAdded}`);
            } else {
                log.info('No streams found within age limit');
            }
        } catch (err: any) {
            log.warn(`Could not fetch streams: ${err.message}`);
        }
    }

    if (SHORTS_LIMIT > 0) {
        log.info(`Fetching Shorts (limit: ${SHORTS_LIMIT}, no age filter)...`);
        const shortsHtml = await fetchChannelPage(channelShortsUrl);
        const shortsData = extractYtInitialData(shortsHtml);
        
        const { shorts: initialShorts, continuationToken: shortsContinuationToken } = findShortsTabData(shortsData);
        const allShorts: Video[] = [...initialShorts.slice(0, SHORTS_LIMIT)];
        
        if (initialShorts.length > 0) {
            log.info(`Found ${initialShorts.length} shorts from initial page`);
        }

        let shortsToken = shortsContinuationToken;
        let shortsPage = 1;
        
        while (shortsToken && allShorts.length < SHORTS_LIMIT) {
            log.info(`Loading more shorts (Page ${shortsPage}), progress: ${allShorts.length}/${SHORTS_LIMIT}`);
            
            const browseData = await fetchBrowseData(shortsToken, channelShortsUrl);
            const { shorts: moreShorts, nextContinuationToken } = extractShortsFromBrowseResponse(browseData);
            
            if (moreShorts.length === 0) {
                break;
            }
            
            const remaining = SHORTS_LIMIT - allShorts.length;
            allShorts.push(...moreShorts.slice(0, remaining));
            
            shortsToken = nextContinuationToken;
            shortsPage++;
        }
        
        if (allShorts.length > 0) {
            log.success(`Total shorts fetched: ${allShorts.length}`);
            allVideos.push(...allShorts);
        }
    }
    
    log.success(`Final total: ${allVideos.length}`);

    return {
        channel,
        videos: allVideos,
        originalIndex: index,
    };
}

async function processChannelsInParallel(channels: string[], concurrencyLimit: number): Promise<ChannelData[]> {
    const results: ChannelData[] = [];
    const total = channels.length;
    let nextIndex = 0;
    
    async function worker(): Promise<void> {
        while (nextIndex < total) {
            const index = nextIndex++;
            try {
                const result = await processChannel(channels[index], index, total);
                results.push(result);
            } catch (err: any) {
                log.error(`Failed to process channel ${channels[index]}: ${err.message}`);
            }
        }
    }
    
    const workers: Promise<void>[] = [];
    const workerCount = Math.min(concurrencyLimit, total);
    for (let i = 0; i < workerCount; i++) {
        workers.push(worker());
    }
    
    await Promise.all(workers);
    
    results.sort((a, b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0));
    
    return results.map(({ channel, videos }) => ({ channel, videos }));
}

async function main(): Promise<void> {
    try {
        log.header('🔄 FETCHING CHANNEL DATA');
        log.info(`Processing ${channelIds.length} channel(s): ${channelIds.join(', ')}`);
        log.info(`Concurrency limit: ${MAX_CONCURRENT_CHANNELS} (based on ${os.cpus().length} CPU cores)`);
        log.info(`Video limit: ${VIDEO_LIMIT === Infinity ? 'unlimited' : VIDEO_LIMIT} per channel`);
        log.info(`Age limit: ${MAX_VIDEO_AGE_DAYS === Infinity ? 'unlimited' : MAX_VIDEO_AGE_DAYS + ' days'}`);
        log.info(`Min length: ${MIN_VIDEO_LENGTH_SECONDS === 0 ? 'disabled' : MIN_VIDEO_LENGTH_SECONDS + ' seconds'}`);
        log.info(`Shorts limit: ${SHORTS_LIMIT === 0 ? 'disabled' : SHORTS_LIMIT + ' per channel'}`);
        log.info(`Enrich videos: ${ENRICH_VIDEOS ? `enabled (concurrency: ${ENRICH_CONCURRENCY}, delay: ${ENRICH_DELAY_MS}ms)` : 'disabled'}`);
        
        const allChannelData = await processChannelsInParallel(channelIds, MAX_CONCURRENT_CHANNELS);

        if (ENRICH_VIDEOS) {
            for (const channelData of allChannelData) {
                channelData.videos = await enrichVideosWithDetails(channelData.videos, ENRICH_CONCURRENCY);
            }
        }

        log.header(`📊 FINAL SUMMARY`);
        const totalVideos = allChannelData.reduce((sum, ch) => sum + ch.videos.filter(v => !v.isShort).length, 0);
        const totalShorts = allChannelData.reduce((sum, ch) => sum + ch.videos.filter(v => v.isShort).length, 0);
        log.info(`Channels processed: ${allChannelData.length}`);
        log.info(`Regular videos: ${totalVideos}`);
        if (totalShorts > 0) log.info(`Shorts: ${totalShorts}`);
        log.success(`Total content: ${totalVideos + totalShorts}`);

        if (GENERATE_HTML) {
            log.header('📄 GENERATING HTML PAGE');
            const outputPath = path.resolve(OUTPUT_FILE);
            generateHtmlPage(allChannelData, outputPath);
            log.success(`HTML page generated: ${outputPath}`);
            log.info(`Open in browser: file://${outputPath}`);
        }
    } catch (err: any) {
        log.error(err.message);
    }
}

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
YouTube Channel Fetcher

Usage: bun run generator/youtube.ts [options]

Options:
  --channel=ID|@HANDLE  YouTube channel ID or handle to fetch (can specify multiple times or comma-separated)
  --limit=N             Maximum number of videos to fetch per channel (default: 150)
  --max-age=DAYS        Maximum age of videos in days (default: unlimited)
  --min-length=SECONDS  Minimum video length in seconds (default: 0 = disabled)
  --shorts-limit=N      Maximum number of shorts to fetch per channel (default: 0 = disabled)
  --enrich              Fetch detailed info for each video (exact publish date, description)
  --enrich-concurrency=N  Max concurrent requests for enrichment (default: 1)
  --enrich-delay=MS     Delay between enrichment requests in ms (default: 2000)
  --html                Generate a static HTML page with channel details
  --output=FILE         Specify output file name (default: channel.html)
  --help | -h           Show this help message

Examples:
  # Using channel ID:
  bun run generator/youtube.ts --channel=UCXuqSBlHAE6Xw-yeJA0Tunw
  bun run generator/youtube.ts --channel=UCXuqSBlHAE6Xw-yeJA0Tunw --html
  
  # Using channel handle (starts with @):
  bun run generator/youtube.ts --channel=@LinusTechTips
  bun run generator/youtube.ts --channel=@LinusTechTips --html --output=linus.html
  
  # Limit by count or age (whichever comes first):
  bun run generator/youtube.ts --channel=@MKBHD --limit=50                    # Max 50 videos
  bun run generator/youtube.ts --channel=@MKBHD --max-age=365                 # Videos from last year only
  bun run generator/youtube.ts --channel=@MKBHD --limit=100 --max-age=180     # Max 100 videos, no older than 6 months
  
  # Filter by minimum length:
  bun run generator/youtube.ts --channel=@MKBHD --min-length=60               # Exclude videos under 1 minute
  bun run generator/youtube.ts --channel=@MKBHD --min-length=300              # Only videos 5+ minutes
  
  # Include Shorts:
  bun run generator/youtube.ts --channel=@MKBHD --shorts-limit=50             # 150 videos + 50 shorts
  bun run generator/youtube.ts --channel=@MKBHD --limit=100 --shorts-limit=30 # 100 videos + 30 shorts
  
  # Enrich with detailed info (publish date, description):
  bun run generator/youtube.ts --channel=@MKBHD --limit=20 --enrich --html    # Fetch details for 20 videos
  bun run generator/youtube.ts --channel=@MKBHD --enrich --enrich-delay=1000  # Slower to avoid rate limits
  
  # Multiple channels (tabs view with combined sortable videos):
  bun run generator/youtube.ts --channel=@LinusTechTips --channel=@MKBHD --html
  bun run generator/youtube.ts --channel=UCXuqSBlHAE6Xw-yeJA0Tunw,@MKBHD --html --output=multi.html

Notes:
  - Channels can be specified by ID (e.g., UCXuqSBlHAE6Xw-yeJA0Tunw) or handle (e.g., @LinusTechTips)
  - When multiple channels are specified, the HTML page shows tabs to switch between channels
  - All videos from all channels are combined and can be sorted together
  - Videos: limited by count (--limit) OR age (--max-age), whichever comes first
  - --min-length filters out videos shorter than the specified seconds (applies to videos and streams, not shorts)
  - Streams: automatically fetched when --max-age is set, same limits as videos
  - Shorts: limited by count only (--shorts-limit), no age or length filter
  - Enrichment is rate-limited; increase --enrich-delay if you get 429 errors
  - --enrich fetches each video's watch page for exact publish date and full description (slower)
`);
    process.exit(0);
}

main();
