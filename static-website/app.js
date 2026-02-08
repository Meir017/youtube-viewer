// YouTube Channel Viewer - Static Site Client-side JavaScript

// Channel colors for indicators
const CHANNEL_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe'];

// Virtual Scroll Configuration
const VIRTUAL_SCROLL_CONFIG = {
    videos: {
        itemHeight: 280, // Approximate height of a video card
        itemWidth: 320,  // Min width for grid calculation
        buffer: 3,       // Number of rows to render above/below viewport
    },
    shorts: {
        itemHeight: 380, // Approximate height of a short card
        itemWidth: 180,  // Min width for grid calculation  
        buffer: 3,       // Number of rows to render above/below viewport
    }
};

// State
let collections = [];
let activeCollectionId = null;
let channels = [];
let allVideos = [];
let allShorts = [];
let isLoading = false;
let activeChannel = 'all';
let searchQuery = '';
let searchQueryShorts = '';
let currentSort = { by: 'default', order: 'desc' };
let currentMaxAge = 30;
let minDurationMinutes = 0;
let maxDurationMinutes = Infinity;

// Virtual scroll state
let videosVirtualScroll = null;
let shortsVirtualScroll = null;

// Video data registry for click handlers (avoids inline JSON escaping issues)
const videoDataRegistry = new Map();

// Virtual Scroll Grid Class
class VirtualScrollGrid {
    constructor(container, config, renderItem) {
        this.container = container;
        this.config = config;
        this.renderItem = renderItem;
        this.items = [];
        this.renderedRange = { start: 0, end: 0 };
        this.columnsCount = 1;
        this.rowHeight = config.itemHeight;
        
        // Create inner container for items
        this.innerContainer = document.createElement('div');
        this.innerContainer.className = 'virtual-scroll-inner';
        this.container.innerHTML = '';
        this.container.appendChild(this.innerContainer);
        
        // Bind methods
        this.handleScroll = this.handleScroll.bind(this);
        this.handleResize = this.handleResize.bind(this);
        
        // Setup listeners
        window.addEventListener('scroll', this.handleScroll, { passive: true });
        window.addEventListener('resize', this.handleResize, { passive: true });
        
        this.resizeObserver = new ResizeObserver(this.handleResize);
        this.resizeObserver.observe(this.container);
    }
    
    setItems(items) {
        this.items = items;
        // Reset rendered range to force re-render with new items
        this.renderedRange = { start: -1, end: -1 };
        this.calculateLayout();
        this.render();
    }
    
    calculateLayout() {
        const containerWidth = this.container.clientWidth;
        const gap = 25; // Grid gap from CSS
        this.columnsCount = Math.max(1, Math.floor((containerWidth + gap) / (this.config.itemWidth + gap)));
        this.rowHeight = this.config.itemHeight + gap;
        
        const totalRows = Math.ceil(this.items.length / this.columnsCount);
        const totalHeight = totalRows * this.rowHeight;
        
        this.innerContainer.style.height = `${totalHeight}px`;
        this.innerContainer.style.position = 'relative';
    }
    
    getVisibleRange() {
        const scrollTop = window.scrollY;
        const viewportHeight = window.innerHeight;
        const containerRect = this.container.getBoundingClientRect();
        const containerTop = containerRect.top + scrollTop;
        
        // Calculate which rows are visible
        const relativeScrollTop = Math.max(0, scrollTop - containerTop);
        const startRow = Math.max(0, Math.floor(relativeScrollTop / this.rowHeight) - this.config.buffer);
        const visibleRows = Math.ceil(viewportHeight / this.rowHeight) + this.config.buffer * 2;
        const endRow = startRow + visibleRows;
        
        const startIndex = startRow * this.columnsCount;
        const endIndex = Math.min(this.items.length, endRow * this.columnsCount);
        
        return { start: startIndex, end: endIndex };
    }
    
    handleScroll() {
        requestAnimationFrame(() => this.render());
    }
    
    handleResize() {
        this.calculateLayout();
        this.render();
    }
    
    render() {
        if (this.items.length === 0) {
            this.innerContainer.innerHTML = '';
            return;
        }
        
        const { start, end } = this.getVisibleRange();
        
        // Only re-render if range changed significantly
        if (start === this.renderedRange.start && end === this.renderedRange.end) {
            return;
        }
        
        this.renderedRange = { start, end };
        
        const gap = 25;
        const itemWidth = (this.container.clientWidth - (this.columnsCount - 1) * gap) / this.columnsCount;
        
        let html = '';
        for (let i = start; i < end; i++) {
            const item = this.items[i];
            const row = Math.floor(i / this.columnsCount);
            const col = i % this.columnsCount;
            const top = row * this.rowHeight;
            const left = col * (itemWidth + gap);
            
            html += `<div class="virtual-item" style="position:absolute;top:${top}px;left:${left}px;width:${itemWidth}px;">
                ${this.renderItem(item)}
            </div>`;
        }
        
        this.innerContainer.innerHTML = html;
    }
    
    destroy() {
        window.removeEventListener('scroll', this.handleScroll);
        window.removeEventListener('resize', this.handleResize);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }
}

// DOM Elements
const errorMessage = document.getElementById('errorMessage');
const loadingOverlay = document.getElementById('loadingOverlay');
const collectionTabs = document.getElementById('collectionTabs');
const channelTabs = document.getElementById('channelTabs');
const channelTabsContainer = document.getElementById('channelTabsContainer');
const catalogFilters = document.getElementById('catalogFilters');
const videosGrid = document.getElementById('videosGrid');
const shortsGrid = document.getElementById('shortsGrid');
const searchBox = document.getElementById('searchBox');
const searchBoxShorts = document.getElementById('searchBoxShorts');
const sortButtons = document.querySelectorAll('.sort-btn');
const totalCollectionsEl = document.getElementById('totalCollections');
const totalChannelsEl = document.getElementById('totalChannels');
const totalVideosEl = document.getElementById('totalVideos');
const totalShortsEl = document.getElementById('totalShorts');
const shortsStatContainer = document.getElementById('shortsStatContainer');
const videoCountEl = document.getElementById('videoCount');
const shortsCountEl = document.getElementById('shortsCount');
const videosSection = document.getElementById('videosSection');
const shortsSection = document.getElementById('shortsSection');
const minDurationInput = document.getElementById('minDurationInput');
const maxDurationInput = document.getElementById('maxDurationInput');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    searchBox.addEventListener('input', handleSearch);
    searchBoxShorts.addEventListener('input', handleSearchShorts);
    
    sortButtons.forEach(btn => {
        btn.addEventListener('click', () => handleSort(btn));
    });
    
    minDurationInput.addEventListener('input', handleDurationFilter);
    maxDurationInput.addEventListener('input', handleDurationFilter);
});

// Parse duration string (e.g., "3:35", "1:00:06") to seconds
function parseDurationToSeconds(duration) {
    if (!duration) return 0;
    const parts = duration.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

// Parse view count string to number
function parseViews(viewStr) {
    if (!viewStr) return 0;
    const str = viewStr.toLowerCase().replace(/,/g, '');
    const fullMatch = str.match(/^([\d]+)/);
    if (fullMatch) return parseInt(fullMatch[1]);
    const abbrMatch = str.match(/([\d.]+)\s*(k|m|b)/);
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

// Parse relative date to age in seconds
function parseDateAge(dateStr) {
    if (!dateStr) return Infinity;
    const str = dateStr.toLowerCase();
    const match = str.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/);
    if (!match) return Infinity;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
    return num * (multipliers[unit] || 1);
}

// Sort videos
function sortVideos(videos) {
    const sorted = [...videos];
    const { by, order } = currentSort;
    
    sorted.sort((a, b) => {
        let valA, valB;
        
        switch (by) {
            case 'views':
                valA = parseViews(a.viewCount);
                valB = parseViews(b.viewCount);
                break;
            case 'duration':
                valA = parseDurationToSeconds(a.duration);
                valB = parseDurationToSeconds(b.duration);
                break;
            case 'date':
                valA = parseDateAge(a.publishedTime);
                valB = parseDateAge(b.publishedTime);
                break;
            case 'title':
                valA = (a.title || '').toLowerCase();
                valB = (b.title || '').toLowerCase();
                return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            default:
                valA = a.originalIndex;
                valB = b.originalIndex;
        }
        
        return order === 'asc' ? valA - valB : valB - valA;
    });
    
    return sorted;
}

// Handle sort button click
function handleSort(btn) {
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
    
    currentSort = { by: sortBy, order };
    renderVideos();
}

// Handle search
function handleSearch(e) {
    searchQuery = e.target.value.toLowerCase().trim();
    renderVideos();
}

function handleSearchShorts(e) {
    searchQueryShorts = e.target.value.toLowerCase().trim();
    renderShorts();
}

// Handle duration filter changes (in-memory filtering)
function handleDurationFilter() {
    const minVal = parseInt(minDurationInput.value) || 0;
    const maxVal = parseInt(maxDurationInput.value);
    
    minDurationMinutes = minVal;
    maxDurationMinutes = isNaN(maxVal) || maxVal === 0 ? Infinity : maxVal;
    
    renderVideos();
    renderShorts();
}

// Load data from static JSON
async function loadData() {
    showLoading(true);
    try {
        const response = await fetch('data/channels.json');
        if (!response.ok) throw new Error('Failed to load data');
        const data = await response.json();
        
        // Build collections list from data
        collections = (data.collections || []).map(c => ({
            id: c.id,
            name: c.name,
        }));
        
        // Store full data for channel loading
        window._staticData = data;
        
        // Auto-select first collection
        if (collections.length > 0) {
            activeCollectionId = collections[0].id;
            loadCollectionFromData(activeCollectionId);
        }
        
        renderAll();
    } catch (error) {
        showError('Failed to load data. Make sure data/channels.json exists.');
        console.error('Load error:', error);
    } finally {
        showLoading(false);
    }
}

function loadCollectionFromData(collectionId) {
    const data = window._staticData;
    if (!data) return;
    
    const collection = data.collections.find(c => c.id === collectionId);
    if (!collection) return;
    
    channels = collection.channels || [];
    processChannelData();
}

// Select a collection
function selectCollection(id) {
    if (activeCollectionId === id) return;
    activeCollectionId = id;
    activeChannel = 'all';
    loadCollectionFromData(id);
    renderAll();
}

// Filter videos based on active channel, search, and duration
function filterVideos(videos) {
    const minDurationSec = minDurationMinutes * 60;
    const maxDurationSec = maxDurationMinutes === Infinity ? Infinity : maxDurationMinutes * 60;
    
    return videos.filter(video => {
        const matchesChannel = activeChannel === 'all' || video.channelIndex === parseInt(activeChannel);
        const matchesSearch = searchQuery === '' || (video.title || '').toLowerCase().includes(searchQuery);
        const durationSec = parseDurationToSeconds(video.duration);
        const matchesMinDuration = durationSec >= minDurationSec;
        const matchesMaxDuration = maxDurationSec === Infinity || durationSec <= maxDurationSec;
        return matchesChannel && matchesSearch && matchesMinDuration && matchesMaxDuration && !video.isShort;
    });
}

function filterShorts(shorts) {
    return shorts.filter(short => {
        const matchesChannel = activeChannel === 'all' || short.channelIndex === parseInt(activeChannel);
        const matchesSearch = searchQueryShorts === '' || (short.title || '').toLowerCase().includes(searchQueryShorts);
        return matchesChannel && matchesSearch;
    });
}

// Process channel data into unified video arrays
function processChannelData() {
    allVideos = [];
    allShorts = [];
    const seenVideoIds = new Set();
    const seenShortIds = new Set();
    
    channels.forEach((ch, channelIndex) => {
        const videos = ch.data?.videos || [];
        const channelTitle = ch.data?.channel?.title || ch.handle;
        const channelHandle = ch.handle;
        const channelAvatar = ch.data?.channel?.avatar || '';
        
        videos.forEach((v, idx) => {
            const videoWithChannel = {
                ...v,
                channelTitle,
                channelHandle,
                channelAvatar,
                channelIndex,
                channelColor: CHANNEL_COLORS[channelIndex % CHANNEL_COLORS.length],
                originalIndex: allVideos.length + allShorts.length,
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
}

// Filter by channel
function setActiveChannel(channelFilter) {
    activeChannel = channelFilter;
    
    // Update tab styles
    document.querySelectorAll('.channel-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.channel === channelFilter);
    });
    
    renderVideos();
    renderShorts();
}

// Render all components
function renderAll() {
    renderCollectionTabs();
    renderSummaryStats();
    updateUIVisibility();
    renderChannelTabs();
    renderVideos();
    renderShorts();
}

// Render collection tabs
function renderCollectionTabs() {
    const collectionTabsHtml = collections.map(col => {
        return `
            <button class="collection-tab ${activeCollectionId === col.id ? 'active' : ''}" data-collection="${col.id}">
                <span class="collection-name">${escapeHtml(col.name)}</span>
            </button>
        `;
    }).join('');
    
    collectionTabs.innerHTML = collectionTabsHtml;
    
    collectionTabs.querySelectorAll('.collection-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            selectCollection(tab.dataset.collection);
        });
    });
}

// Update UI visibility based on whether a collection is selected
function updateUIVisibility() {
    const hasCollection = activeCollectionId !== null;
    channelTabsContainer.hidden = !hasCollection;
    catalogFilters.hidden = !hasCollection;
    videosSection.hidden = !hasCollection;
    shortsSection.hidden = !hasCollection || allShorts.length === 0;
}

// Render summary stats
function renderSummaryStats() {
    totalCollectionsEl.textContent = collections.length;
    totalChannelsEl.textContent = channels.length;
    totalVideosEl.textContent = allVideos.length;
    totalShortsEl.textContent = allShorts.length;
    
    if (allShorts.length > 0) {
        shortsStatContainer.hidden = false;
    } else {
        shortsStatContainer.hidden = true;
    }
}

// Render channel tabs
function renderChannelTabs() {
    const allTab = `
        <button class="channel-tab ${activeChannel === 'all' ? 'active' : ''}" data-channel="all" style="--channel-color: #fff;">
            <span class="channel-dot"></span>
            All Channels
        </button>
    `;
    
    const channelTabsHtml = channels.map((ch, idx) => {
        const channelData = ch.data?.channel || {};
        const title = escapeHtml(channelData.title || ch.handle);
        const avatarUrl = channelData.avatar || '';
        const color = CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
        
        return `
            <button class="channel-tab ${activeChannel === String(idx) ? 'active' : ''}" data-channel="${idx}" style="--channel-color: ${color};">
                ${avatarUrl ? `<img src="${avatarUrl}" alt="${title}" class="channel-avatar" loading="lazy">` : `<span class="channel-dot"></span>`}
                ${title}
            </button>
        `;
    }).join('');
    
    channelTabs.innerHTML = allTab + channelTabsHtml;
    
    channelTabs.querySelectorAll('.channel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            setActiveChannel(tab.dataset.channel);
        });
    });
}

// Render videos grid
function renderVideos() {
    const filtered = filterVideos(allVideos);
    const sorted = sortVideos(filtered);
    
    videoCountEl.textContent = sorted.length;
    
    if (sorted.length === 0) {
        // Destroy existing virtual scroll
        if (videosVirtualScroll) {
            videosVirtualScroll.destroy();
            videosVirtualScroll = null;
        }
        
        if (channels.length === 0) {
            videosGrid.innerHTML = `
                <div class="empty-state">
                    <h3>No data available</h3>
                    <p>No channel data found.</p>
                </div>
            `;
        } else {
            videosGrid.innerHTML = `
                <div class="empty-state">
                    <h3>No videos found</h3>
                    <p>Try adjusting your search or selecting a different channel.</p>
                </div>
            `;
        }
        return;
    }
    
    // Initialize or update virtual scroll
    if (!videosVirtualScroll) {
        videosVirtualScroll = new VirtualScrollGrid(
            videosGrid,
            VIRTUAL_SCROLL_CONFIG.videos,
            renderVideoCard
        );
    }
    videosVirtualScroll.setItems(sorted);
}

// Render shorts grid
function renderShorts() {
    const filtered = filterShorts(allShorts);
    
    shortsCountEl.textContent = filtered.length;
    
    if (filtered.length === 0) {
        // Destroy existing virtual scroll
        if (shortsVirtualScroll) {
            shortsVirtualScroll.destroy();
            shortsVirtualScroll = null;
        }
        shortsSection.hidden = true;
        return;
    }
    
    shortsSection.hidden = false;
    
    // Initialize or update virtual scroll
    if (!shortsVirtualScroll) {
        shortsVirtualScroll = new VirtualScrollGrid(
            shortsGrid,
            VIRTUAL_SCROLL_CONFIG.shorts,
            renderShortCard
        );
    }
    shortsVirtualScroll.setItems(filtered);
}

// Render a video card
function renderVideoCard(video) {
    const { videoId, title, viewCount, publishedTime, publishDate, description, duration, channelTitle, channelColor, channelHandle, channelAvatar } = video;
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    const showChannelIndicator = channels.length > 1;
    const avatarUrl = channelAvatar || '';
    
    // Store video data in registry to avoid inline JSON escaping issues
    const videoData = { videoId, title, viewCount, publishedTime, publishDate, description, channelTitle };
    videoDataRegistry.set(videoId, videoData);
    
    // Date display: show exact date with relative time in parentheses if enriched
    let dateDisplay = '';
    if (publishDate) {
        dateDisplay = `📅 ${escapeHtml(publishDate)}${publishedTime ? ` (${escapeHtml(publishedTime)})` : ''}`;
    } else if (publishedTime) {
        dateDisplay = `📅 ${escapeHtml(publishedTime)}`;
    }
    
    // Enriched indicator (shows if video has description data)
    const enrichedBadge = description ? '<span class="enriched-badge" title="Click for full description">📝</span>' : '';
    
    return `
        <article class="video-card" onclick="openVideoModalById('${videoId}')" style="cursor: pointer;">
            <div class="video-thumbnail">
                ${showChannelIndicator ? `<span class="channel-indicator" style="--channel-color: ${channelColor};">${avatarUrl ? `<img src="${avatarUrl}" alt="" class="channel-indicator-icon">` : ''}${escapeHtml(channelTitle)}</span>` : ''}
                <img src="${thumbnail}" alt="${escapeHtml(title)}" loading="lazy">
                ${duration ? `<span class="video-duration">${escapeHtml(duration)}</span>` : ''}
                ${enrichedBadge}
            </div>
            <div class="video-info">
                <h3 class="video-title">${escapeHtml(title)}</h3>
                <div class="video-meta">
                    ${viewCount ? `<span>👁️ ${escapeHtml(viewCount)}</span>` : ''}
                    ${dateDisplay ? `<span>${dateDisplay}</span>` : ''}
                </div>
            </div>
        </article>
    `;
}

// Render a short card
function renderShortCard(short) {
    const { videoId, title, viewCount, channelTitle, channelColor, channelHandle, channelAvatar } = short;
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/oar2.jpg`;
    const showChannelIndicator = channels.length > 1;
    const avatarUrl = channelAvatar || '';
    
    // Store short data in registry to avoid inline JSON escaping issues
    const shortData = { videoId, title: title || 'Untitled Short', viewCount, channelTitle, isShort: true };
    videoDataRegistry.set(videoId, shortData);
    
    return `
        <article class="short-card" onclick="openVideoModalById('${videoId}')" style="cursor: pointer;">
            <div class="short-thumbnail">
                <span class="short-badge">Short</span>
                ${showChannelIndicator ? `<span class="channel-indicator" style="--channel-color: ${channelColor}; top: 35px;">${avatarUrl ? `<img src="${avatarUrl}" alt="" class="channel-indicator-icon">` : ''}${escapeHtml(channelTitle)}</span>` : ''}
                <img src="${thumbnail}" alt="${escapeHtml(title)}" loading="lazy">
            </div>
            <div class="short-info">
                <h3 class="short-title">${escapeHtml(title || 'Untitled Short')}</h3>
                <div class="short-meta">
                    ${viewCount ? `<span>👁️ ${escapeHtml(viewCount)}</span>` : ''}
                </div>
            </div>
        </article>
    `;
}

// Helper functions
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Convert URLs in text to clickable links
function linkifyText(text) {
    if (!text) return '';
    // First escape HTML to prevent XSS
    const escaped = escapeHtml(text);
    // Then convert URLs to links
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    return escaped.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function showLoading(show) {
    isLoading = show;
    loadingOverlay.hidden = !show;
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
}

function hideError() {
    errorMessage.hidden = true;
}

// Video Modal Functions
const videoPlayerModal = document.getElementById('videoPlayerModal');
const videoPlayerIframe = document.getElementById('videoPlayerIframe');
const videoModalTitle = document.getElementById('videoModalTitle');
const videoModalChannel = document.getElementById('videoModalChannel');
const videoModalViews = document.getElementById('videoModalViews');
const videoModalDate = document.getElementById('videoModalDate');
const videoModalDescription = document.getElementById('videoModalDescription');
const videoModalLink = document.getElementById('videoModalLink');
const closeVideoModalBtn = document.getElementById('closeVideoModal');

// Open video modal by ID (looks up data from registry)
function openVideoModalById(videoId) {
    const videoData = videoDataRegistry.get(videoId);
    if (videoData) {
        openVideoModal(videoData);
    } else {
        console.error('Video data not found for ID:', videoId);
    }
}

function openVideoModal(videoData) {
    const { videoId, title, viewCount, publishedTime, publishDate, description, channelTitle, isShort } = videoData;
    
    // Build YouTube embed URL
    const embedUrl = isShort 
        ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`
        : `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    
    // Build YouTube watch/shorts URL
    const youtubeUrl = isShort
        ? `https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`;
    
    // Set iframe source
    videoPlayerIframe.src = embedUrl;
    
    // Set modal info
    videoModalTitle.textContent = title || 'Untitled';
    videoModalChannel.textContent = channelTitle ? `📺 ${channelTitle}` : '';
    videoModalViews.textContent = viewCount ? `👁️ ${viewCount}` : '';
    
    // Date display: show exact date with relative time if enriched
    if (publishDate) {
        videoModalDate.textContent = `📅 ${publishDate}${publishedTime ? ` (${publishedTime})` : ''}`;
    } else if (publishedTime) {
        videoModalDate.textContent = `📅 ${publishedTime}`;
    } else {
        videoModalDate.textContent = '';
    }
    
    // Description display (if enriched)
    if (description) {
        videoModalDescription.innerHTML = linkifyText(description);
        videoModalDescription.hidden = false;
    } else {
        videoModalDescription.innerHTML = '';
        videoModalDescription.hidden = true;
    }
    
    videoModalLink.href = youtubeUrl;
    
    // Show modal
    videoPlayerModal.hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeVideoModal() {
    videoPlayerModal.hidden = true;
    videoPlayerIframe.src = ''; // Stop video playback
    document.body.style.overflow = '';
}

// Video modal event listeners
closeVideoModalBtn.addEventListener('click', closeVideoModal);

videoPlayerModal.querySelector('.video-modal-backdrop').addEventListener('click', closeVideoModal);

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !videoPlayerModal.hidden) {
        closeVideoModal();
    }
});
