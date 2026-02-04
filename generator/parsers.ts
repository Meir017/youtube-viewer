import { log } from './logger';
import { extractVideoFromRenderer, isMembersOnlyVideo } from './utils';
import type {
    Video,
    Short,
    ChannelDetails,
    ChannelLink,
    ExtendedDetails,
    VideosTabResult,
    ShortsTabResult,
    BrowseVideosResult,
    BrowseShortsResult,
} from './types';

export function extractYtInitialData(html: string): any {
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

export function findContinuationTokens(obj: any, tokens: string[] = []): string[] {
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

export function findVideosTabData(data: any): VideosTabResult {
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
                    if (renderer && !isMembersOnlyVideo(renderer)) {
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
                        if (renderer && !isMembersOnlyVideo(renderer)) {
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

export function findShortsTabData(data: any): ShortsTabResult {
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

export function extractShortsFromBrowseResponse(data: any): BrowseShortsResult {
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

export function extractVideosFromBrowseResponse(data: any): BrowseVideosResult {
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
        
        if (renderer && !isMembersOnlyVideo(renderer)) {
            videos.push(extractVideoFromRenderer(renderer));
        }
    }
    
    return { videos, rawItemCount: continuationItems.length, nextContinuationToken };
}

export function extractVideosFromInitialData(data: any): Video[] {
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
            
            if (renderer && !isMembersOnlyVideo(renderer)) {
                videos.push(extractVideoFromRenderer(renderer));
            }
        }
    }
    
    return videos;
}

export function extractChannelDetails(data: any): ChannelDetails {
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

export function extractAboutDetails(data: any): ExtendedDetails {
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
