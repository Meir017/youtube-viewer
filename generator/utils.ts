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

export function isMembersOnlyVideo(renderer: any): boolean {
    if (!renderer) return false;
    
    const badges = renderer.badges || [];
    for (const badge of badges) {
        const badgeRenderer = badge.metadataBadgeRenderer;
        if (badgeRenderer?.style === 'BADGE_STYLE_TYPE_MEMBERS_ONLY') {
            return true;
        }
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

/**
 * Detect whether a lockupViewModel represents a members-only video.
 */
export function isMembersOnlyLockup(lockup: any): boolean {
    if (!lockup) return false;
    const meta = lockup?.metadata?.lockupMetadataViewModel;
    const badges = meta?.badges || meta?.metadata?.contentMetadataViewModel?.badges || [];
    for (const badge of badges) {
        const style = badge?.thumbnailBadgeViewModel?.badgeStyle
            || badge?.badgeViewModel?.style;
        if (typeof style === 'string' && style.includes('MEMBERS')) {
            return true;
        }
    }
    return false;
}

/**
 * Detect whether a lockupViewModel represents a short.
 * Shorts in the new format use LOCKUP_CONTENT_TYPE_SHORTS and have no duration overlay.
 */
function isLockupShort(lockup: any): boolean {
    if (!lockup) return false;
    if (lockup.contentType === 'LOCKUP_CONTENT_TYPE_SHORTS') return true;
    // Shorts have an aspect ratio-based thumbnail and no duration badge
    return false;
}

/**
 * Extract a Video from the new YouTube lockupViewModel format.
 * YouTube migrated from `videoRenderer` to `lockupViewModel` for channel video listings.
 */
export function extractVideoFromLockupViewModel(lockup: any): Video {
    const meta = lockup?.metadata?.lockupMetadataViewModel;
    const title = meta?.title?.content
        || meta?.title?.runs?.[0]?.text;

    // metadataRows[0].metadataParts is typically [viewCount, publishedTime]
    const metadataParts = meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts || [];
    let viewCount: string | undefined;
    let publishedTime: string | undefined;
    for (const part of metadataParts) {
        const text: string | undefined = part?.text?.content;
        if (!text) continue;
        if (/view/i.test(text)) {
            viewCount = text;
        } else if (/ago\b/i.test(text)) {
            publishedTime = text;
        }
    }
    // Fallback to positional if heuristics didn't match
    if (!viewCount && metadataParts[0]?.text?.content) viewCount = metadataParts[0].text.content;
    if (!publishedTime && metadataParts[1]?.text?.content) publishedTime = metadataParts[1].text.content;

    // Duration is in thumbnail overlay badges (e.g. "15:10")
    let duration: string | undefined;
    const overlays = lockup?.contentImage?.thumbnailViewModel?.overlays || [];
    for (const overlay of overlays) {
        const badges = overlay?.thumbnailBottomOverlayViewModel?.badges || [];
        for (const badge of badges) {
            const text: string | undefined = badge?.thumbnailBadgeViewModel?.text;
            if (text && /^\d{1,2}(:\d{2}){1,2}$/.test(text)) {
                duration = text;
                break;
            }
        }
        if (duration) break;
    }

    return {
        videoId: lockup?.contentId,
        title,
        viewCount,
        publishedTime,
        duration,
        isShort: isLockupShort(lockup),
    };
}
