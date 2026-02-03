import { log } from './logger';
import { browseApiUrl, CLIENT_CONTEXT, ENRICH_DELAY_MS } from './config';
import type { Video, VideoDetails } from './types';

export async function fetchChannelPage(url: string): Promise<string> {
    log.fetch(`Requesting page: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const html = await response.text();
    log.success(`Received ${(html.length / 1024).toFixed(1)} KB`);
    return html;
}

export async function fetchBrowseData(continuation: string, channelUrl: string): Promise<any> {
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

export async function fetchVideoDetails(videoId: string): Promise<VideoDetails> {
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

export async function enrichVideosWithDetails(videos: Video[], concurrency: number): Promise<Video[]> {
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
            await Bun.sleep(ENRICH_DELAY_MS);
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
