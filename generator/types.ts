// TypeScript interfaces
export interface ChannelUrls {
    channelIdentifier: string;
    isHandle: boolean;
    channelUrl: string;
    channelShortsUrl: string;
    channelStreamsUrl: string;
    channelAboutUrl: string;
}

export interface Video {
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

export interface Short {
    videoId: string;
    title?: string;
    viewCount?: string;
    isShort: true;
}

export interface ChannelDetails {
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

export interface ChannelLink {
    title?: string;
    url?: string;
}

export interface ChannelData {
    channel: ChannelDetails;
    videos: Video[];
    originalIndex?: number;
}

export interface ExtendedDetails {
    viewCount: string | null;
    joinDate: string | null;
    country: string | null;
    links: ChannelLink[];
}

export interface VideosTabResult {
    videos: Video[];
    continuationToken: string | null;
    tabTitle?: string | null;
}

export interface ShortsTabResult {
    shorts: Short[];
    continuationToken: string | null;
}

export interface BrowseVideosResult {
    videos: Video[];
    rawItemCount: number;
    nextContinuationToken: string | null;
}

export interface BrowseShortsResult {
    shorts: Short[];
    rawItemCount: number;
    nextContinuationToken: string | null;
}

export interface VideoDetails {
    publishDate: string | null;
    description: string | null;
}
