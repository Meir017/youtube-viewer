// Mock YouTube API implementation for testing
// Returns configurable responses without making real network calls

import type { YouTubeApi, VideoDetails } from '../../website/interfaces/youtube-api';

export interface MockChannelPageResponse {
    html: string;
}

export interface MockBrowseDataResponse {
    data: any;
}

/**
 * Configuration for the mock YouTube API.
 */
export interface MockYouTubeApiConfig {
    /**
     * Map of URL patterns to HTML responses for fetchChannelPage.
     */
    channelPages?: Map<string, string>;
    
    /**
     * Map of continuation tokens to browse data responses.
     */
    browseData?: Map<string, any>;
    
    /**
     * Map of video IDs to video details.
     */
    videoDetails?: Map<string, VideoDetails>;
    
    /**
     * Default HTML response for unmatched channel pages.
     */
    defaultChannelPageHtml?: string;
    
    /**
     * Default browse data response for unmatched tokens.
     */
    defaultBrowseData?: any;
    
    /**
     * Default video details for unmatched video IDs.
     */
    defaultVideoDetails?: VideoDetails;
    
    /**
     * If true, throw errors for unmatched requests instead of returning defaults.
     */
    strictMode?: boolean;
    
    /**
     * Delay in milliseconds before returning responses (simulates network latency).
     */
    delay?: number;
}

/**
 * Creates a mock YouTube API implementation for testing.
 */
export function createMockYouTubeApi(config: MockYouTubeApiConfig = {}): YouTubeApi & { 
    calls: { fetchChannelPage: string[]; fetchBrowseData: Array<{ token: string; url: string }>; fetchVideoDetails: string[] } 
} {
    const {
        channelPages = new Map(),
        browseData = new Map(),
        videoDetails = new Map(),
        defaultChannelPageHtml = '<html></html>',
        defaultBrowseData = {},
        defaultVideoDetails = { publishDate: null, description: null },
        strictMode = false,
        delay = 0,
    } = config;
    
    // Track calls for assertions
    const calls = {
        fetchChannelPage: [] as string[],
        fetchBrowseData: [] as Array<{ token: string; url: string }>,
        fetchVideoDetails: [] as string[],
    };
    
    const maybeDelay = async () => {
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    };
    
    return {
        calls,
        
        async fetchChannelPage(url: string): Promise<string> {
            calls.fetchChannelPage.push(url);
            await maybeDelay();
            
            // Check for exact match first
            if (channelPages.has(url)) {
                return channelPages.get(url)!;
            }
            
            // Check for partial matches (URL contains key)
            for (const [key, value] of channelPages) {
                if (url.includes(key)) {
                    return value;
                }
            }
            
            if (strictMode) {
                throw new Error(`Mock YouTube API: No response configured for URL: ${url}`);
            }
            
            return defaultChannelPageHtml;
        },
        
        async fetchBrowseData(continuation: string, channelUrl: string): Promise<any> {
            calls.fetchBrowseData.push({ token: continuation, url: channelUrl });
            await maybeDelay();
            
            if (browseData.has(continuation)) {
                return browseData.get(continuation)!;
            }
            
            if (strictMode) {
                throw new Error(`Mock YouTube API: No response configured for continuation token: ${continuation}`);
            }
            
            return defaultBrowseData;
        },
        
        async fetchVideoDetails(videoId: string): Promise<VideoDetails> {
            calls.fetchVideoDetails.push(videoId);
            await maybeDelay();
            
            if (videoDetails.has(videoId)) {
                return videoDetails.get(videoId)!;
            }
            
            if (strictMode) {
                throw new Error(`Mock YouTube API: No response configured for video ID: ${videoId}`);
            }
            
            return defaultVideoDetails;
        },
    };
}

/**
 * Creates a mock YouTube API that simulates errors.
 */
export function createErrorMockYouTubeApi(errorMessage: string = 'Network error'): YouTubeApi {
    return {
        async fetchChannelPage(): Promise<string> {
            throw new Error(errorMessage);
        },
        async fetchBrowseData(): Promise<any> {
            throw new Error(errorMessage);
        },
        async fetchVideoDetails(): Promise<VideoDetails> {
            throw new Error(errorMessage);
        },
    };
}

/**
 * Creates a mock YouTube API that simulates rate limiting (429 errors).
 */
export function createRateLimitedMockYouTubeApi(failAfter: number = 5): YouTubeApi & { requestCount: number } {
    let requestCount = 0;
    
    return {
        get requestCount() { return requestCount; },
        
        async fetchChannelPage(url: string): Promise<string> {
            requestCount++;
            if (requestCount > failAfter) {
                throw new Error('HTTP 429: Too Many Requests');
            }
            return '<html></html>';
        },
        
        async fetchBrowseData(continuation: string, channelUrl: string): Promise<any> {
            requestCount++;
            if (requestCount > failAfter) {
                throw new Error('HTTP 429: Too Many Requests');
            }
            return {};
        },
        
        async fetchVideoDetails(videoId: string): Promise<VideoDetails> {
            requestCount++;
            if (requestCount > failAfter) {
                throw new Error('HTTP 429: Too Many Requests');
            }
            return { publishDate: '2024-01-01', description: 'Test video' };
        },
    };
}
