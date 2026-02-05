// Interface for YouTube API operations
// Allows mocking in tests without making real network calls

import type { Video } from '../../generator/types';

export interface VideoDetails {
    publishDate: string | null;
    description: string | null;
}

export interface ChannelPageResult {
    html: string;
}

export interface BrowseDataResult {
    data: any;
}

/**
 * Interface for fetching data from YouTube.
 * Used by channel-processor.ts to fetch channel pages and browse data.
 */
export interface YouTubeApi {
    /**
     * Fetch the HTML content of a YouTube channel page.
     */
    fetchChannelPage(url: string): Promise<string>;
    
    /**
     * Fetch browse data (video pagination) using continuation token.
     */
    fetchBrowseData(continuation: string, channelUrl: string): Promise<any>;
    
    /**
     * Fetch video details (publish date, description) for a specific video.
     */
    fetchVideoDetails(videoId: string): Promise<VideoDetails>;
}

/**
 * Create the real YouTube API implementation.
 * Uses the actual fetch calls from generator/api.ts.
 */
export function createYouTubeApi(): YouTubeApi {
    // Dynamically import to avoid circular dependencies
    const { fetchChannelPage, fetchBrowseData, fetchVideoDetails } = require('../../generator/api');
    
    return {
        fetchChannelPage,
        fetchBrowseData,
        fetchVideoDetails,
    };
}
