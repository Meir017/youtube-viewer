import { MAX_VIDEO_AGE_DAYS, MIN_VIDEO_LENGTH_SECONDS } from './config';
import type { Video } from './types';

export function parseRelativeTimeTodays(timeStr: string | undefined): number {
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

export function isUpcomingStream(publishedTime: string | undefined): boolean {
    if (!publishedTime) return true;
    const lower = publishedTime.toLowerCase();
    return lower.includes('scheduled') || 
           lower.includes('premieres') || 
           lower.includes('waiting') ||
           lower.includes('upcoming');
}

export function isVideoTooOld(publishedTime: string | undefined): boolean {
    if (MAX_VIDEO_AGE_DAYS === Infinity) return false;
    const ageDays = parseRelativeTimeTodays(publishedTime);
    return ageDays > MAX_VIDEO_AGE_DAYS;
}

export function parseDurationToSeconds(durationStr: string | undefined): number {
    if (!durationStr) return 0;
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

export function isVideoTooShort(duration: string | undefined): boolean {
    if (MIN_VIDEO_LENGTH_SECONDS === 0) return false;
    const durationSeconds = parseDurationToSeconds(duration);
    return durationSeconds < MIN_VIDEO_LENGTH_SECONDS;
}

export function isVideoShort(renderer: any): boolean {
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

export function extractVideoFromRenderer(renderer: any): Video {
    return {
        videoId: renderer.videoId,
        title: renderer.title?.runs?.[0]?.text || renderer.title?.simpleText,
        viewCount: renderer.viewCountText?.simpleText || renderer.viewCountText?.runs?.[0]?.text,
        publishedTime: renderer.publishedTimeText?.simpleText,
        duration: renderer.lengthText?.simpleText || renderer.lengthText?.accessibility?.accessibilityData?.label,
        isShort: isVideoShort(renderer),
    };
}
