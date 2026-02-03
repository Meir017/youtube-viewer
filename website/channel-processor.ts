// Channel processor for web - simplified version of the CLI generator
import { fetchChannelPage, fetchBrowseData } from '../generator/api';
import {
    extractYtInitialData,
    findVideosTabData,
    extractVideosFromBrowseResponse,
    extractChannelDetails,
    extractAboutDetails,
} from '../generator/parsers';
import { isVideoTooOld, isVideoTooShort, extractVideoFromRenderer } from '../generator/utils';
import type { ChannelDetails, Video, VideosTabResult } from '../generator/types';

// Shared config for web
const browseApiUrl = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';

export interface WebChannelData {
    channel: ChannelDetails;
    videos: Video[];
}

interface WebConfig {
    videoLimit: number;
    maxAgeDays: number;
    minLengthSeconds: number;
}

const DEFAULT_CONFIG: WebConfig = {
    videoLimit: 50,
    maxAgeDays: 30,
    minLengthSeconds: 0,
};

function getChannelUrls(channelIdentifier: string) {
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
}

export async function processChannelForWeb(
    channelInput: string,
    config: Partial<WebConfig> = {}
): Promise<WebChannelData> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const { channelIdentifier, channelUrl, channelStreamsUrl, channelAboutUrl } = getChannelUrls(channelInput);
    
    console.log(`📺 Processing channel: ${channelIdentifier}`);
    
    // Fetch about page for channel details
    const aboutHtml = await fetchChannelPage(channelAboutUrl);
    const aboutData = extractYtInitialData(aboutHtml);
    const channel = extractChannelDetails(aboutData);
    
    if (channel.aboutContinuationToken) {
        console.log('  Fetching extended channel details...');
        const extendedData = await fetchBrowseData(channel.aboutContinuationToken, channelAboutUrl);
        const extended = extractAboutDetails(extendedData);
        
        channel.viewCount = channel.viewCount || extended.viewCount;
        channel.joinDate = channel.joinDate || extended.joinDate;
        channel.country = channel.country || extended.country;
        if (extended.links.length > 0) {
            channel.links = extended.links;
        }
    }
    
    console.log(`  Channel: ${channel.title}`);
    
    // Fetch videos
    const html = await fetchChannelPage(channelUrl);
    const data = extractYtInitialData(html);
    const { videos: initialVideos, continuationToken } = findVideosTabData(data);
    
    const isVideoTooOldForWeb = (publishedTime?: string) => {
        if (!publishedTime || cfg.maxAgeDays === Infinity) return false;
        const str = publishedTime.toLowerCase();
        const match = str.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/);
        if (!match) return false;
        const num = parseInt(match[1], 10);
        const unit = match[2];
        let days = 0;
        switch (unit) {
            case 'second': case 'minute': case 'hour': days = 0; break;
            case 'day': days = num; break;
            case 'week': days = num * 7; break;
            case 'month': days = num * 30; break;
            case 'year': days = num * 365; break;
        }
        return days > cfg.maxAgeDays;
    };

    const isVideoTooShortForWeb = (duration?: string) => {
        if (!duration || cfg.minLengthSeconds === 0) return false;
        const parts = duration.split(':').map(Number);
        let seconds = 0;
        if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
        else seconds = parts[0];
        return seconds < cfg.minLengthSeconds;
    };

    const allVideos: Video[] = [...initialVideos.filter(v => 
        !isVideoTooOldForWeb(v.publishedTime) && !isVideoTooShortForWeb(v.duration)
    )];
    
    let currentToken = continuationToken;
    let reachedAgeLimit = false;
    
    // Paginate to get more videos up to the limit
    while (currentToken && allVideos.length < cfg.videoLimit && !reachedAgeLimit) {
        console.log(`  Loading more videos, have: ${allVideos.length}/${cfg.videoLimit}`);
        
        const browseData = await fetchBrowseData(currentToken, channelUrl);
        const { videos: moreVideos, nextContinuationToken } = extractVideosFromBrowseResponse(browseData);
        
        if (moreVideos.length === 0) break;
        
        for (const video of moreVideos) {
            if (allVideos.length >= cfg.videoLimit) break;
            if (isVideoTooOldForWeb(video.publishedTime)) {
                reachedAgeLimit = true;
                break;
            }
            if (isVideoTooShortForWeb(video.duration)) continue;
            allVideos.push(video);
        }
        
        currentToken = nextContinuationToken;
    }
    
    console.log(`  ✓ Found ${allVideos.length} videos`);
    
    return {
        channel,
        videos: allVideos,
    };
}
