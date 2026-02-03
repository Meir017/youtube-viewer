import { log, colors } from './logger';
import {
    channelIds,
    getChannelUrls,
    VIDEO_LIMIT,
    MAX_VIDEO_AGE_DAYS,
    SHORTS_LIMIT,
    MIN_VIDEO_LENGTH_SECONDS,
    MAX_CONCURRENT_CHANNELS,
    GENERATE_HTML,
    OUTPUT_FILE,
    ENRICH_VIDEOS,
    ENRICH_CONCURRENCY,
    ENRICH_DELAY_MS,
} from './config';
import { isVideoTooOld, isVideoTooShort, isUpcomingStream, extractVideoFromRenderer } from './utils';
import { fetchChannelPage, fetchBrowseData, enrichVideosWithDetails } from './api';
import {
    extractYtInitialData,
    findVideosTabData,
    findShortsTabData,
    extractVideosFromBrowseResponse,
    extractShortsFromBrowseResponse,
    extractChannelDetails,
    extractAboutDetails,
} from './parsers';
import { generateHtmlPage } from './html-generator';
import type { ChannelData, Video, VideosTabResult } from './types';

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
        log.info(`Concurrency limit: ${MAX_CONCURRENT_CHANNELS} (based on ${navigator.hardwareConcurrency ?? 4} CPU cores)`);
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
            const { resolve } = await import('path');
            const outputPath = resolve(process.cwd(), OUTPUT_FILE);
            const filePath = await generateHtmlPage(allChannelData, outputPath);
            log.success(`HTML page generated: ${filePath}`);
        } else {
            console.log(JSON.stringify(allChannelData, null, 2));
        }

    } catch (error: any) {
        log.error(`Fatal error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
