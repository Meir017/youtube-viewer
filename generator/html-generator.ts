import type { ChannelData, Video } from './types';

const escapeHtml = (str: string | undefined | null): string => {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const formatNumber = (str: string | undefined | null): string => {
    if (!str) return 'N/A';
    return str;
};

const calculateActualDate = (relativeTime: string | undefined): string | null => {
    if (!relativeTime) return null;
    const str = relativeTime.toLowerCase();
    const match = str.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/);
    if (!match) return null;
    
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const now = new Date();
    
    switch (unit) {
        case 'second': now.setSeconds(now.getSeconds() - num); break;
        case 'minute': now.setMinutes(now.getMinutes() - num); break;
        case 'hour': now.setHours(now.getHours() - num); break;
        case 'day': now.setDate(now.getDate() - num); break;
        case 'week': now.setDate(now.getDate() - num * 7); break;
        case 'month': now.setMonth(now.getMonth() - num); break;
        case 'year': now.setFullYear(now.getFullYear() - num); break;
    }
    
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    return `~${dateStr} (approximate)`;
};

export async function generateHtmlPage(channels: ChannelData[], outputPath: string): Promise<string> {
    const allVideos: Video[] = [];
    const allShorts: Video[] = [];
    const seenVideoIds = new Set<string>();
    const seenShortIds = new Set<string>();
    
    channels.forEach((ch, channelIndex) => {
        ch.videos.forEach(v => {
            const videoWithChannel = {
                ...v,
                channelTitle: ch.channel.title,
                channelIndex,
            };
            if (v.isShort) {
                if (!seenShortIds.has(v.videoId)) {
                    seenShortIds.add(v.videoId);
                    allShorts.push(videoWithChannel);
                }
            } else {
                if (!seenVideoIds.has(v.videoId)) {
                    seenVideoIds.add(v.videoId);
                    allVideos.push(videoWithChannel);
                }
            }
        });
    });

    const isMultiChannel = channels.length > 1;
    
    const channelColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe'];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${isMultiChannel ? 'Multi-Channel View' : escapeHtml(channels[0]?.channel.title)} - YouTube Channel</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .channel-header {
            background: linear-gradient(135deg, #2d3436 0%, #1e272e 100%);
            border-radius: 16px;
            padding: 40px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .channel-title {
            font-size: 3rem;
            font-weight: 700;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .channel-stats {
            display: flex;
            flex-wrap: wrap;
            gap: 30px;
            margin-bottom: 25px;
        }
        
        .stat-item {
            background: rgba(255,255,255,0.15);
            padding: 15px 25px;
            border-radius: 12px;
            backdrop-filter: blur(10px);
        }
        
        .stat-label {
            font-size: 0.85rem;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .stat-value {
            font-size: 1.4rem;
            font-weight: 600;
        }
        
        .channel-description {
            background: rgba(0,0,0,0.2);
            padding: 20px;
            border-radius: 12px;
            white-space: pre-wrap;
            font-size: 0.95rem;
            line-height: 1.8;
        }
        
        .channel-links {
            margin-top: 20px;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .channel-link {
            background: rgba(255,255,255,0.2);
            color: #fff;
            padding: 8px 16px;
            border-radius: 20px;
            text-decoration: none;
            font-size: 0.9rem;
            transition: all 0.3s ease;
        }
        
        .channel-link:hover {
            background: rgba(255,255,255,0.3);
            transform: translateY(-2px);
        }
        
        .videos-section {
            margin-top: 40px;
        }
        
        .section-title {
            font-size: 2rem;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .video-count {
            background: #ff0000;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 1rem;
        }
        
        .videos-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 25px;
        }
        
        .video-card {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.3s ease;
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .video-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.4);
            border-color: rgba(255,0,0,0.5);
        }
        
        .video-thumbnail {
            position: relative;
            width: 100%;
            aspect-ratio: 16/9;
            background: #000;
        }
        
        .video-thumbnail img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .video-duration {
            position: absolute;
            bottom: 8px;
            right: 8px;
            background: rgba(0,0,0,0.85);
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 0.85rem;
            font-weight: 500;
        }
        
        .video-info {
            padding: 15px;
        }
        
        .video-title {
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 10px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        
        .video-title a {
            color: #fff;
            text-decoration: none;
        }
        
        .video-title a:hover {
            color: #ff6b6b;
        }
        
        .video-meta {
            font-size: 0.85rem;
            color: rgba(255,255,255,0.6);
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
        }
        
        .video-meta span {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .video-description {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid rgba(255,255,255,0.1);
        }
        
        .video-description-toggle {
            background: none;
            border: none;
            color: rgba(255,255,255,0.7);
            cursor: pointer;
            font-size: 0.8rem;
            padding: 5px 0;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: color 0.2s;
        }
        
        .video-description-toggle:hover {
            color: #fff;
        }
        
        .video-description-content {
            display: none;
            margin-top: 10px;
            padding: 12px;
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            font-size: 0.85rem;
            line-height: 1.6;
            color: rgba(255,255,255,0.8);
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .video-description-content.expanded {
            display: block;
        }
        
        .video-description-content::-webkit-scrollbar {
            width: 6px;
        }
        
        .video-description-content::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.05);
            border-radius: 3px;
        }
        
        .video-description-content::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.2);
            border-radius: 3px;
        }
        
        .video-description-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255,255,255,0.3);
        }
        
        .footer {
            text-align: center;
            padding: 40px 20px;
            opacity: 0.6;
            font-size: 0.9rem;
        }
        
        .controls {
            margin-bottom: 25px;
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }
        
        .search-box {
            flex: 1;
            min-width: 250px;
            padding: 12px 20px;
            border-radius: 25px;
            border: 2px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 1rem;
            outline: none;
            transition: all 0.3s ease;
        }
        
        .search-box:focus {
            border-color: #ff0000;
            background: rgba(255,255,255,0.1);
        }
        
        .search-box::placeholder {
            color: rgba(255,255,255,0.5);
        }
        
        .sort-buttons {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .sort-btn {
            padding: 10px 18px;
            border-radius: 20px;
            border: 2px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .sort-btn:hover {
            background: rgba(255,255,255,0.15);
            border-color: rgba(255,255,255,0.3);
        }
        
        .sort-btn.active {
            background: #ff0000;
            border-color: #ff0000;
        }
        
        .sort-btn .sort-icon {
            font-size: 0.8rem;
            opacity: 0.7;
        }
        
        .sort-btn.active .sort-icon {
            opacity: 1;
        }
        
        @media (max-width: 768px) {
            .channel-title {
                font-size: 2rem;
            }
            
            .channel-stats {
                gap: 15px;
            }
            
            .stat-item {
                padding: 10px 15px;
            }
            
            .videos-grid {
                grid-template-columns: 1fr;
            }
            
            .shorts-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        
        .shorts-section {
            margin-top: 50px;
        }
        
        .shorts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 20px;
        }
        
        .short-card {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.3s ease;
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .short-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.4);
            border-color: rgba(255,0,200,0.5);
        }
        
        .short-thumbnail {
            position: relative;
            width: 100%;
            aspect-ratio: 9/16;
            background: #000;
        }
        
        .short-thumbnail img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .short-badge {
            position: absolute;
            top: 8px;
            left: 8px;
            background: linear-gradient(135deg, #ff0050 0%, #ff0000 100%);
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .short-info {
            padding: 12px;
        }
        
        .short-title {
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 8px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            line-height: 1.3;
        }
        
        .short-title a {
            color: #fff;
            text-decoration: none;
        }
        
        .short-title a:hover {
            color: #ff6b6b;
        }
        
        .short-meta {
            font-size: 0.8rem;
            color: rgba(255,255,255,0.6);
        }
        
        .section-count {
            background: #ff0000;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 1rem;
        }
        
        .section-count.shorts {
            background: linear-gradient(135deg, #ff0050 0%, #ff0000 100%);
        }
        
        .content-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 25px;
        }
        
        .tab-btn {
            padding: 10px 25px;
            border-radius: 25px;
            border: 2px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .tab-btn:hover {
            background: rgba(255,255,255,0.1);
        }
        
        .tab-btn.active {
            background: #ff0000;
            border-color: #ff0000;
        }
        
        .tab-btn.active.shorts {
            background: linear-gradient(135deg, #ff0050 0%, #ff0000 100%);
            border-color: #ff0050;
        }
        
        .channel-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 25px;
            flex-wrap: wrap;
        }
        
        .channel-tab {
            padding: 12px 24px;
            border-radius: 25px;
            border: 2px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .channel-tab:hover {
            background: rgba(255,255,255,0.1);
        }
        
        .channel-tab.active {
            background: rgba(255,255,255,0.15);
            border-color: var(--channel-color, #ff0000);
        }
        
        .channel-tab .channel-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--channel-color, #ff0000);
        }
        
        .channel-indicator {
            position: absolute;
            top: 8px;
            left: 8px;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            background: var(--channel-color, #ff0000);
            color: #fff;
            max-width: 80%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            z-index: 1;
        }
        
        .multi-channel-header {
            background: linear-gradient(135deg, #2d3436 0%, #1e272e 100%);
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .multi-channel-title {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 15px;
        }
        
        .multi-channel-summary {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .summary-stat {
            background: rgba(255,255,255,0.1);
            padding: 12px 20px;
            border-radius: 10px;
        }
        
        .summary-stat-label {
            font-size: 0.8rem;
            opacity: 0.7;
            text-transform: uppercase;
        }
        
        .summary-stat-value {
            font-size: 1.3rem;
            font-weight: 600;
        }
        
        .channel-header-row {
            display: none;
            transition: all 0.3s ease;
        }
        
        .channel-header-row.active {
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        ${isMultiChannel ? `
        <header class="multi-channel-header">
            <h1 class="multi-channel-title">📺 Multi-Channel View</h1>
            <div class="multi-channel-summary">
                <div class="summary-stat">
                    <div class="summary-stat-label">📺 Channels</div>
                    <div class="summary-stat-value">${channels.length}</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-label">🎬 Videos</div>
                    <div class="summary-stat-value">${allVideos.length}</div>
                </div>
                ${allShorts.length > 0 ? `
                <div class="summary-stat">
                    <div class="summary-stat-label">📱 Shorts</div>
                    <div class="summary-stat-value">${allShorts.length}</div>
                </div>
                ` : ''}
            </div>
            
            <div class="channel-tabs" id="channelTabs">
                <button class="channel-tab active" data-channel="all" style="--channel-color: #fff;">
                    <span class="channel-dot"></span>
                    All Channels
                </button>
                ${channels.map((ch, idx) => `
                <button class="channel-tab" data-channel="${idx}" style="--channel-color: ${channelColors[idx % channelColors.length]};">
                    <span class="channel-dot"></span>
                    ${escapeHtml(ch.channel.title)}
                </button>
                `).join('')}
            </div>
        </header>
        
        ${channels.map((ch, idx) => `
        <div class="channel-header-row" data-channel-header="${idx}">
            <header class="channel-header">
                <h1 class="channel-title">📺 ${escapeHtml(ch.channel.title)}</h1>
                
                <div class="channel-stats">
                    ${ch.channel.subscriberCount ? `<div class="stat-item"><div class="stat-label">👥 Subscribers</div><div class="stat-value">${escapeHtml(ch.channel.subscriberCount)}</div></div>` : ''}
                    ${ch.channel.videoCount ? `<div class="stat-item"><div class="stat-label">🎬 Videos</div><div class="stat-value">${escapeHtml(ch.channel.videoCount)}</div></div>` : ''}
                    ${ch.channel.viewCount ? `<div class="stat-item"><div class="stat-label">👁️ Total Views</div><div class="stat-value">${escapeHtml(ch.channel.viewCount)}</div></div>` : ''}
                    ${ch.channel.joinDate ? `<div class="stat-item"><div class="stat-label">📅 Joined</div><div class="stat-value">${escapeHtml(ch.channel.joinDate.replace('Joined ', ''))}</div></div>` : ''}
                    ${ch.channel.country ? `<div class="stat-item"><div class="stat-label">🌍 Country</div><div class="stat-value">${escapeHtml(ch.channel.country)}</div></div>` : ''}
                </div>
                
                ${ch.channel.links && ch.channel.links.length > 0 ? `
                <div class="channel-links">
                    ${ch.channel.links.map(link => `<a href="https://${escapeHtml(link.url)}" target="_blank" rel="noopener" class="channel-link">🔗 ${escapeHtml(link.title || link.url)}</a>`).join('')}
                </div>
                ` : ''}
                
                ${ch.channel.description ? `<div class="channel-description">${escapeHtml(ch.channel.description)}</div>` : ''}
            </header>
        </div>
        `).join('')}
        ` : `
        <header class="channel-header">
            <h1 class="channel-title">📺 ${escapeHtml(channels[0].channel.title)}</h1>
            
            <div class="channel-stats">
                ${channels[0].channel.subscriberCount ? `<div class="stat-item"><div class="stat-label">👥 Subscribers</div><div class="stat-value">${escapeHtml(channels[0].channel.subscriberCount)}</div></div>` : ''}
                ${channels[0].channel.videoCount ? `<div class="stat-item"><div class="stat-label">🎬 Videos</div><div class="stat-value">${escapeHtml(channels[0].channel.videoCount)}</div></div>` : ''}
                ${channels[0].channel.viewCount ? `<div class="stat-item"><div class="stat-label">👁️ Total Views</div><div class="stat-value">${escapeHtml(channels[0].channel.viewCount)}</div></div>` : ''}
                ${channels[0].channel.joinDate ? `<div class="stat-item"><div class="stat-label">📅 Joined</div><div class="stat-value">${escapeHtml(channels[0].channel.joinDate.replace('Joined ', ''))}</div></div>` : ''}
                ${channels[0].channel.country ? `<div class="stat-item"><div class="stat-label">🌍 Country</div><div class="stat-value">${escapeHtml(channels[0].channel.country)}</div></div>` : ''}
            </div>
            
            ${channels[0].channel.links && channels[0].channel.links.length > 0 ? `
            <div class="channel-links">
                ${channels[0].channel.links.map(link => `<a href="https://${escapeHtml(link.url)}" target="_blank" rel="noopener" class="channel-link">🔗 ${escapeHtml(link.title || link.url)}</a>`).join('')}
            </div>
            ` : ''}
            
            ${channels[0].channel.description ? `<div class="channel-description">${escapeHtml(channels[0].channel.description)}</div>` : ''}
        </header>
        `}
        
        <section class="videos-section" id="videosSection">
            <h2 class="section-title">
                🎬 Videos
                <span class="section-count">${allVideos.length}</span>
            </h2>
            
            <div class="controls">
                <input type="text" class="search-box" placeholder="🔍 Search videos..." id="searchBox">
                <div class="sort-buttons">
                    <button class="sort-btn active" data-sort="default" data-order="desc">
                        <span>Default</span>
                    </button>
                    <button class="sort-btn" data-sort="views" data-order="desc">
                        <span>👁️ Views</span>
                        <span class="sort-icon">▼</span>
                    </button>
                    <button class="sort-btn" data-sort="date" data-order="desc">
                        <span>📅 Date</span>
                        <span class="sort-icon">▼</span>
                    </button>
                    <button class="sort-btn" data-sort="duration" data-order="desc">
                        <span>⏱️ Duration</span>
                        <span class="sort-icon">▼</span>
                    </button>
                    <button class="sort-btn" data-sort="title" data-order="asc">
                        <span>🔤 Title</span>
                        <span class="sort-icon">▲</span>
                    </button>
                </div>
            </div>
            
            <div class="videos-grid" id="videosGrid">
                ${allVideos.map((video, index) => `
                <article class="video-card" data-title="${escapeHtml(video.title?.toLowerCase() || '')}" data-views="${escapeHtml(video.viewCount || '0')}" data-date="${escapeHtml(video.publishedTime || '')}" data-exact-date="${escapeHtml(video.publishDate || '')}" data-duration="${escapeHtml(video.duration || '0:00')}" data-index="${index}" data-channel="${video.channelIndex}">
                    <div class="video-thumbnail">
                        ${isMultiChannel ? `<span class="channel-indicator" style="--channel-color: ${channelColors[(video.channelIndex ?? 0) % channelColors.length]};">${escapeHtml(video.channelTitle)}</span>` : ''}
                        <a href="https://www.youtube.com/watch?v=${escapeHtml(video.videoId)}" target="_blank" rel="noopener">
                            <img src="https://i.ytimg.com/vi/${escapeHtml(video.videoId)}/mqdefault.jpg" alt="${escapeHtml(video.title)}" loading="lazy">
                        </a>
                        ${video.duration ? `<span class="video-duration">${escapeHtml(video.duration)}</span>` : ''}
                    </div>
                    <div class="video-info">
                        <h3 class="video-title">
                            <a href="https://www.youtube.com/watch?v=${escapeHtml(video.videoId)}" target="_blank" rel="noopener">
                                ${escapeHtml(video.title)}
                            </a>
                        </h3>
                        <div class="video-meta">
                            ${video.viewCount ? `<span>👁️ ${escapeHtml(video.viewCount)}</span>` : ''}
                            ${video.publishDate 
                                ? `<span>📅 ${escapeHtml(video.publishDate)}${video.publishedTime ? ` (${escapeHtml(video.publishedTime)})` : ''}</span>` 
                                : (video.publishedTime ? `<span title="${escapeHtml(calculateActualDate(video.publishedTime) || video.publishedTime)}">📅 ${escapeHtml(video.publishedTime)}</span>` : '')}
                        </div>
                        ${video.description ? `
                        <div class="video-description">
                            <button class="video-description-toggle" onclick="this.nextElementSibling.classList.toggle('expanded'); this.querySelector('.toggle-icon').textContent = this.nextElementSibling.classList.contains('expanded') ? '▲' : '▼';">
                                <span class="toggle-icon">▼</span> Description
                            </button>
                            <div class="video-description-content">${escapeHtml(video.description)}</div>
                        </div>
                        ` : ''}
                    </div>
                </article>
                `).join('')}
            </div>
        </section>
        
        ${allShorts.length > 0 ? `
        <section class="shorts-section" id="shortsSection">
            <h2 class="section-title">
                📱 Shorts
                <span class="section-count shorts">${allShorts.length}</span>
            </h2>
            
            <div class="controls">
                <input type="text" class="search-box" placeholder="🔍 Search shorts..." id="searchBoxShorts">
            </div>
            
            <div class="shorts-grid" id="shortsGrid">
                ${allShorts.map(short => `
                <article class="short-card" data-title="${escapeHtml(short.title?.toLowerCase() || '')}" data-channel="${short.channelIndex}">
                    <div class="short-thumbnail">
                        ${isMultiChannel ? `<span class="channel-indicator" style="--channel-color: ${channelColors[(short.channelIndex ?? 0) % channelColors.length]}; top: 35px;">${escapeHtml(short.channelTitle)}</span>` : ''}
                        <a href="https://www.youtube.com/shorts/${escapeHtml(short.videoId)}" target="_blank" rel="noopener">
                            <img src="https://i.ytimg.com/vi/${escapeHtml(short.videoId)}/oar2.jpg" alt="${escapeHtml(short.title)}" loading="lazy">
                        </a>
                        <span class="short-badge">Short</span>
                    </div>
                    <div class="short-info">
                        <h3 class="short-title">
                            <a href="https://www.youtube.com/shorts/${escapeHtml(short.videoId)}" target="_blank" rel="noopener">
                                ${escapeHtml(short.title || 'Untitled Short')}
                            </a>
                        </h3>
                        <div class="short-meta">
                            ${short.viewCount ? `<span>👁️ ${escapeHtml(short.viewCount)}</span>` : ''}
                        </div>
                    </div>
                </article>
                `).join('')}
            </div>
        </section>
        ` : ''}
        
        <footer class="footer">
            <p>Generated on ${new Date().toLocaleString()} • ${allVideos.length} videos${allShorts.length > 0 ? ` • ${allShorts.length} shorts` : ''}${isMultiChannel ? ` • ${channels.length} channels` : ''}</p>
            <p>Data fetched from YouTube</p>
        </footer>
    </div>
    
    <script>
        const searchBox = document.getElementById('searchBox');
        const videosGrid = document.getElementById('videosGrid');
        const videoCards = videosGrid?.querySelectorAll('.video-card') || [];
        
        const searchBoxShorts = document.getElementById('searchBoxShorts');
        const shortsGrid = document.getElementById('shortsGrid');
        const shortCards = shortsGrid?.querySelectorAll('.short-card') || [];
        
        const sortButtons = document.querySelectorAll('.sort-btn');
        
        function parseViews(viewStr) {
            if (!viewStr) return 0;
            const str = viewStr.toLowerCase().replace(/,/g, '');
            const fullMatch = str.match(/^([\\d]+)/);
            if (fullMatch) {
                return parseInt(fullMatch[1]);
            }
            const abbrMatch = str.match(/([\\d.]+)\\s*(k|m|b)/);
            if (abbrMatch) {
                let num = parseFloat(abbrMatch[1]);
                const suffix = abbrMatch[2];
                if (suffix === 'k') num *= 1000;
                else if (suffix === 'm') num *= 1000000;
                else if (suffix === 'b') num *= 1000000000;
                return num;
            }
            return 0;
        }
        
        function parseDuration(durStr) {
            if (!durStr) return 0;
            const parts = durStr.split(':').map(Number);
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            return parts[0] || 0;
        }
        
        function parseDateAge(dateStr) {
            if (!dateStr) return Infinity;
            const str = dateStr.toLowerCase();
            const match = str.match(/(\\d+)\\s*(second|minute|hour|day|week|month|year)s?/);
            if (!match) return Infinity;
            const num = parseInt(match[1]);
            const unit = match[2];
            const multipliers = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
            return num * (multipliers[unit] || 1);
        }
        
        function parseExactDate(dateStr) {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return null;
            return date.getTime();
        }
        
        function sortVideos(sortBy, order) {
            const cardsArray = Array.from(videoCards);
            
            cardsArray.sort((a, b) => {
                let valA, valB;
                
                switch (sortBy) {
                    case 'views':
                        valA = parseViews(a.dataset.views);
                        valB = parseViews(b.dataset.views);
                        break;
                    case 'duration':
                        valA = parseDuration(a.dataset.duration);
                        valB = parseDuration(b.dataset.duration);
                        break;
                    case 'date':
                        const exactA = parseExactDate(a.dataset.exactDate);
                        const exactB = parseExactDate(b.dataset.exactDate);
                        if (exactA !== null && exactB !== null) {
                            valA = -exactA;
                            valB = -exactB;
                        } else if (exactA !== null) {
                            valA = 0;
                            valB = parseDateAge(b.dataset.date);
                        } else if (exactB !== null) {
                            valA = parseDateAge(a.dataset.date);
                            valB = 0;
                        } else {
                            valA = parseDateAge(a.dataset.date);
                            valB = parseDateAge(b.dataset.date);
                        }
                        break;
                    case 'title':
                        valA = a.dataset.title || '';
                        valB = b.dataset.title || '';
                        return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                    default:
                        valA = parseInt(a.dataset.index);
                        valB = parseInt(b.dataset.index);
                }
                
                return order === 'asc' ? valA - valB : valB - valA;
            });
            
            cardsArray.forEach(card => videosGrid.appendChild(card));
        }
        
        sortButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const sortBy = btn.dataset.sort;
                let order = btn.dataset.order;
                
                if (btn.classList.contains('active') && sortBy !== 'default') {
                    order = order === 'asc' ? 'desc' : 'asc';
                    btn.dataset.order = order;
                    const icon = btn.querySelector('.sort-icon');
                    if (icon) icon.textContent = order === 'asc' ? '▲' : '▼';
                }
                
                sortButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                sortVideos(sortBy, order);
            });
        });
        
        const channelTabs = document.querySelectorAll('.channel-tab');
        const channelHeaders = document.querySelectorAll('.channel-header-row');
        let activeChannel = 'all';
        
        function filterByChannel(channelFilter) {
            activeChannel = channelFilter;
            
            videoCards.forEach(card => {
                const cardChannel = card.dataset.channel;
                const matchesSearch = searchBox.value.toLowerCase().trim() === '' || 
                    (card.dataset.title || '').includes(searchBox.value.toLowerCase().trim());
                const matchesChannel = channelFilter === 'all' || cardChannel === channelFilter;
                card.style.display = matchesSearch && matchesChannel ? '' : 'none';
            });
            
            shortCards.forEach(card => {
                const cardChannel = card.dataset.channel;
                const matchesSearch = searchBoxShorts?.value.toLowerCase().trim() === '' || 
                    (card.dataset.title || '').includes(searchBoxShorts?.value.toLowerCase().trim());
                const matchesChannel = channelFilter === 'all' || cardChannel === channelFilter;
                card.style.display = matchesSearch && matchesChannel ? '' : 'none';
            });
            
            channelHeaders.forEach(header => {
                const headerChannel = header.dataset.channelHeader;
                if (channelFilter === 'all') {
                    header.classList.remove('active');
                } else if (headerChannel === channelFilter) {
                    header.classList.add('active');
                } else {
                    header.classList.remove('active');
                }
            });
        }
        
        channelTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                channelTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                filterByChannel(tab.dataset.channel);
            });
        });
        
        if (searchBox) {
            searchBox.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                
                videoCards.forEach(card => {
                    const title = card.dataset.title || '';
                    const cardChannel = card.dataset.channel;
                    const matchesSearch = query === '' || title.includes(query);
                    const matchesChannel = activeChannel === 'all' || cardChannel === activeChannel;
                    card.style.display = matchesSearch && matchesChannel ? '' : 'none';
                });
            });
        }
        
        if (searchBoxShorts) {
            searchBoxShorts.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                
                shortCards.forEach(card => {
                    const title = card.dataset.title || '';
                    const cardChannel = card.dataset.channel;
                    const matchesSearch = query === '' || title.includes(query);
                    const matchesChannel = activeChannel === 'all' || cardChannel === activeChannel;
                    card.style.display = matchesSearch && matchesChannel ? '' : 'none';
                });
            });
        }
    </script>
</body>
</html>`;

    await Bun.write(outputPath, html);
    return outputPath;
}
