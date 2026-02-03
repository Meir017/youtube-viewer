import type { ChannelUrls } from './types';

// Parse CLI arguments
const args = Bun.argv.slice(2);

export const GENERATE_HTML = args.includes('--html');
export const OUTPUT_FILE = args.find(a => a.startsWith('--output='))?.split('=')[1] || 'channel.html';
const CLI_LIMIT = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const CLI_MAX_AGE = args.find(a => a.startsWith('--max-age='))?.split('=')[1];
const CLI_SHORTS_LIMIT = args.find(a => a.startsWith('--shorts-limit='))?.split('=')[1];
const CLI_MIN_LENGTH = args.find(a => a.startsWith('--min-length='))?.split('=')[1];
export const ENRICH_VIDEOS = args.includes('--enrich');
const CLI_ENRICH_CONCURRENCY = args.find(a => a.startsWith('--enrich-concurrency='))?.split('=')[1];
const CLI_ENRICH_DELAY = args.find(a => a.startsWith('--enrich-delay='))?.split('=')[1];

// Enrichment settings - conservative defaults to avoid rate limiting
export const ENRICH_CONCURRENCY = CLI_ENRICH_CONCURRENCY ? parseInt(CLI_ENRICH_CONCURRENCY, 10) : 1;
export const ENRICH_DELAY_MS = CLI_ENRICH_DELAY ? parseInt(CLI_ENRICH_DELAY, 10) : 2000;

// Support multiple channels via multiple --channel= flags or comma-separated values
const channelArgs = args.filter(a => a.startsWith('--channel=')).map(a => a.split('=')[1]);
export const channelIds = channelArgs.length > 0 
    ? channelArgs.flatMap(c => c.split(',').map(id => id.trim()).filter(id => id))
    : ['UCYp3rk70ACGXQ4gFAiMr1SQ'];

export const browseApiUrl = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';

// Helper to build channel URLs (supports both channel IDs and handles)
export const getChannelUrls = (channelIdentifier: string): ChannelUrls => {
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
export const VIDEO_LIMIT = CLI_LIMIT ? parseInt(CLI_LIMIT, 10) : 150;

// Maximum age of videos in days (set to Infinity for no age limit)
export const MAX_VIDEO_AGE_DAYS = CLI_MAX_AGE ? parseInt(CLI_MAX_AGE, 10) : Infinity;

// Maximum number of shorts to fetch (0 = disabled)
export const SHORTS_LIMIT = CLI_SHORTS_LIMIT ? parseInt(CLI_SHORTS_LIMIT, 10) : 0;

// Minimum video length in seconds (0 = no minimum)
export const MIN_VIDEO_LENGTH_SECONDS = CLI_MIN_LENGTH ? parseInt(CLI_MIN_LENGTH, 10) : 0;

// Maximum concurrent channel fetches (based on CPU cores, min 2, max 8)
export const MAX_CONCURRENT_CHANNELS = Math.min(8, Math.max(2, navigator.hardwareConcurrency ?? 4));

export const CLIENT_CONTEXT = {
    clientName: 'WEB',
    clientVersion: '2.20260128.05.00',
    acceptHeader: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
};
