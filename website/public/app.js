// YouTube Channel Viewer - Client-side JavaScript
const API_BASE = '/api';

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
const addChannelForm = document.getElementById('addChannelForm');
const channelInput = document.getElementById('channelInput');
const addBtn = document.getElementById('addBtn');
const errorMessage = document.getElementById('errorMessage');
const loadingOverlay = document.getElementById('loadingOverlay');
const collectionTabs = document.getElementById('collectionTabs');
const channelTabs = document.getElementById('channelTabs');
const channelTabsContainer = document.getElementById('channelTabsContainer');
const addChannelSection = document.getElementById('addChannelSection');
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
const maxAgeInput = document.getElementById('maxAgeInput');
const applyMaxAgeBtn = document.getElementById('applyMaxAgeBtn');
const minDurationInput = document.getElementById('minDurationInput');
const maxDurationInput = document.getElementById('maxDurationInput');

// Refresh button
const refreshAllBtn = document.getElementById('refreshAllBtn');

// Collection modal elements
const addCollectionBtn = document.getElementById('addCollectionBtn');
const addCollectionModal = document.getElementById('addCollectionModal');
const addCollectionForm = document.getElementById('addCollectionForm');
const collectionNameInput = document.getElementById('collectionNameInput');
const cancelCollectionBtn = document.getElementById('cancelCollectionBtn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadCollections();
    addChannelForm.addEventListener('submit', handleAddChannel);
    searchBox.addEventListener('input', handleSearch);
    searchBoxShorts.addEventListener('input', handleSearchShorts);
    
    sortButtons.forEach(btn => {
        btn.addEventListener('click', () => handleSort(btn));
    });
    
    // Refresh button listener
    refreshAllBtn.addEventListener('click', handleRefreshAll);
    
    // Catalog filter listeners
    applyMaxAgeBtn.addEventListener('click', handleApplyMaxAge);
    minDurationInput.addEventListener('input', handleDurationFilter);
    maxDurationInput.addEventListener('input', handleDurationFilter);
    
    // Collection modal listeners
    addCollectionBtn.addEventListener('click', () => {
        addCollectionModal.hidden = false;
        collectionNameInput.focus();
    });
    
    cancelCollectionBtn.addEventListener('click', () => {
        addCollectionModal.hidden = true;
        collectionNameInput.value = '';
    });
    
    addCollectionForm.addEventListener('submit', handleAddCollection);
    
    // Close modal on backdrop click
    addCollectionModal.addEventListener('click', (e) => {
        if (e.target === addCollectionModal) {
            addCollectionModal.hidden = true;
            collectionNameInput.value = '';
        }
    });
    
    // Rename collection modal listeners
    const renameCollectionModal = document.getElementById('renameCollectionModal');
    const renameCollectionForm = document.getElementById('renameCollectionForm');
    const cancelRenameBtn = document.getElementById('cancelRenameBtn');
    const renameCollectionInput = document.getElementById('renameCollectionInput');
    
    cancelRenameBtn.addEventListener('click', () => {
        renameCollectionModal.hidden = true;
        renameCollectionInput.value = '';
    });
    
    renameCollectionForm.addEventListener('submit', handleRenameCollection);
    
    // Close rename modal on backdrop click
    renameCollectionModal.addEventListener('click', (e) => {
        if (e.target === renameCollectionModal) {
            renameCollectionModal.hidden = true;
            renameCollectionInput.value = '';
        }
    });
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

// Handle max-age apply button (reloads catalog from server)
async function handleApplyMaxAge() {
    if (!activeCollectionId) return;
    
    const newMaxAge = parseInt(maxAgeInput.value) || 0;
    currentMaxAge = newMaxAge;
    
    applyMaxAgeBtn.disabled = true;
    applyMaxAgeBtn.textContent = '...';
    applyMaxAgeBtn.classList.add('loading');
    
    try {
        await refreshCollectionChannels();
    } catch (error) {
        showError('Failed to reload channels with new max age');
        console.error('Max age refresh error:', error);
    } finally {
        applyMaxAgeBtn.disabled = false;
        applyMaxAgeBtn.textContent = 'Apply';
        applyMaxAgeBtn.classList.remove('loading');
    }
}

// Handle refresh all button click
async function handleRefreshAll() {
    if (!activeCollectionId || isLoading) return;
    
    refreshAllBtn.disabled = true;
    refreshAllBtn.classList.add('loading');
    const refreshIcon = refreshAllBtn.querySelector('.refresh-icon');
    const refreshText = refreshAllBtn.querySelector('.refresh-text');
    refreshText.textContent = 'Refreshing...';
    refreshIcon.style.animation = 'spin 1s linear infinite';
    
    try {
        await refreshCollectionChannels();
    } catch (error) {
        showError('Failed to refresh videos');
        console.error('Refresh error:', error);
    } finally {
        refreshAllBtn.disabled = false;
        refreshAllBtn.classList.remove('loading');
        refreshText.textContent = 'Refresh';
        refreshIcon.style.animation = '';
    }
}

// Refresh channels in current collection with current max-age setting
async function refreshCollectionChannels() {
    if (!activeCollectionId) return;
    
    showLoading(true);
    
    try {
        const maxAgeDays = currentMaxAge === 0 ? 36500 : currentMaxAge;
        const response = await fetch(`${API_BASE}/collections/${activeCollectionId}/channels?maxAgeDays=${maxAgeDays}`);
        if (!response.ok) throw new Error('Failed to refresh channels');
        channels = await response.json();
        processChannelData();
        renderChannelTabs();
        renderVideos();
        renderShorts();
    } finally {
        showLoading(false);
    }
}

// Filter videos based on active channel, search, and duration
function filterVideos(videos) {
    const minDurationSec = minDurationMinutes * 60;
    const maxDurationSec = maxDurationMinutes === Infinity ? Infinity : maxDurationMinutes * 60;
    
    return videos.filter(video => {
        const matchesChannel = activeChannel === 'all' || video.channelIndex === parseInt(activeChannel);
        const matchesSearch = searchQuery === '' || (video.title || '').toLowerCase().includes(searchQuery);
        
        // Duration filter
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

// Load collections from API
async function loadCollections() {
    showLoading(true);
    try {
        const response = await fetch(`${API_BASE}/collections`);
        if (!response.ok) throw new Error('Failed to load collections');
        collections = await response.json();
        
        // Auto-select first collection if exists
        if (collections.length > 0 && !activeCollectionId) {
            activeCollectionId = collections[0].id;
            await loadCollectionChannels(activeCollectionId);
        }
        
        renderAll();
    } catch (error) {
        showError('Failed to load collections. Please refresh the page.');
        console.error('Load error:', error);
    } finally {
        showLoading(false);
    }
}

// Load channels for a specific collection
async function loadCollectionChannels(collectionId) {
    showLoading(true);
    try {
        const response = await fetch(`${API_BASE}/collections/${collectionId}/channels`);
        if (!response.ok) throw new Error('Failed to load channels');
        channels = await response.json();
        processChannelData();
    } catch (error) {
        showError('Failed to load channels.');
        console.error('Load channels error:', error);
        channels = [];
        allVideos = [];
        allShorts = [];
    } finally {
        showLoading(false);
    }
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
        const channelHandle = ch.handle; // Store handle for image proxy
        const channelAvatar = ch.data?.channel?.avatar || ''; // Store avatar for channel indicator
        
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

// Add a new collection
async function handleAddCollection(e) {
    e.preventDefault();
    
    const name = collectionNameInput.value.trim();
    if (!name) return;
    
    try {
        const response = await fetch(`${API_BASE}/collections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to add collection');
        }
        
        collections.push(data);
        activeCollectionId = data.id;
        channels = [];
        allVideos = [];
        allShorts = [];
        renderAll();
        
        addCollectionModal.hidden = true;
        collectionNameInput.value = '';
    } catch (error) {
        showError(error.message);
        console.error('Add collection error:', error);
    }
}

// Delete a collection
async function deleteCollection(id, e) {
    e.stopPropagation();
    if (!confirm('Delete this collection and all its channels?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/collections/${id}`, {
            method: 'DELETE',
        });
        
        if (!response.ok) throw new Error('Failed to delete collection');
        
        collections = collections.filter(c => c.id !== id);
        
        if (activeCollectionId === id) {
            activeCollectionId = collections.length > 0 ? collections[0].id : null;
            if (activeCollectionId) {
                await loadCollectionChannels(activeCollectionId);
            } else {
                channels = [];
                allVideos = [];
                allShorts = [];
            }
        }
        
        renderAll();
    } catch (error) {
        showError('Failed to delete collection');
        console.error('Delete collection error:', error);
    }
}

// Open rename collection modal
function openRenameModal(id, currentName, e) {
    e.stopPropagation();
    const renameModal = document.getElementById('renameCollectionModal');
    const renameInput = document.getElementById('renameCollectionInput');
    const renameIdInput = document.getElementById('renameCollectionId');
    
    renameInput.value = currentName;
    renameIdInput.value = id;
    renameModal.hidden = false;
    renameInput.focus();
    renameInput.select();
}

// Rename a collection
async function handleRenameCollection(e) {
    e.preventDefault();
    
    const renameInput = document.getElementById('renameCollectionInput');
    const renameIdInput = document.getElementById('renameCollectionId');
    const renameModal = document.getElementById('renameCollectionModal');
    
    const id = renameIdInput.value;
    const newName = renameInput.value.trim();
    
    if (!newName) return;
    
    try {
        const response = await fetch(`${API_BASE}/collections/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName }),
        });
        
        if (!response.ok) throw new Error('Failed to rename collection');
        
        const updated = await response.json();
        const index = collections.findIndex(c => c.id === id);
        if (index !== -1) {
            collections[index] = updated;
        }
        
        renderCollectionTabs();
        renameModal.hidden = true;
    } catch (error) {
        showError('Failed to rename collection');
        console.error('Rename collection error:', error);
    }
}

// Select a collection
async function selectCollection(id) {
    if (activeCollectionId === id) return;
    
    activeCollectionId = id;
    activeChannel = 'all';
    await loadCollectionChannels(id);
    renderAll();
}

// Add a new channel to current collection
async function handleAddChannel(e) {
    e.preventDefault();
    
    const handle = channelInput.value.trim();
    if (!handle || !activeCollectionId) return;
    
    setAddButtonLoading(true);
    hideError();
    
    try {
        const response = await fetch(`${API_BASE}/collections/${activeCollectionId}/channels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to add channel');
        }
        
        channels.push(data);
        processChannelData();
        renderChannelTabs();
        renderVideos();
        renderShorts();
        renderSummaryStats();
        channelInput.value = '';
    } catch (error) {
        showError(error.message);
        console.error('Add error:', error);
    } finally {
        setAddButtonLoading(false);
    }
}

// Delete a channel from current collection
async function deleteChannel(id, e) {
    e.stopPropagation();
    if (!confirm('Remove this channel?')) return;
    if (!activeCollectionId) return;
    
    try {
        const response = await fetch(`${API_BASE}/collections/${activeCollectionId}/channels/${id}`, {
            method: 'DELETE',
        });
        
        if (!response.ok) throw new Error('Failed to delete channel');
        
        channels = channels.filter(c => c.id !== id);
        activeChannel = 'all';
        processChannelData();
        renderChannelTabs();
        renderVideos();
        renderShorts();
        renderSummaryStats();
    } catch (error) {
        showError('Failed to delete channel');
        console.error('Delete error:', error);
    }
}

// Refresh a channel in current collection
async function refreshChannel(id) {
    if (!activeCollectionId) return;
    
    const tab = document.querySelector(`[data-channel="${channels.findIndex(c => c.id === id)}"]`);
    if (tab) tab.classList.add('refreshing');
    
    try {
        const response = await fetch(`${API_BASE}/collections/${activeCollectionId}/channels/${id}/refresh`, {
            method: 'POST',
        });
        
        if (!response.ok) throw new Error('Failed to refresh channel');
        
        const updated = await response.json();
        const index = channels.findIndex(c => c.id === id);
        if (index !== -1) {
            channels[index] = updated;
        }
        processChannelData();
        renderChannelTabs();
        renderVideos();
        renderShorts();
        renderSummaryStats();
    } catch (error) {
        showError('Failed to refresh channel');
        console.error('Refresh error:', error);
    }
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
                <span class="collection-actions">
                    <span class="rename-collection" onclick="openRenameModal('${col.id}', '${escapeHtml(col.name)}', event)" title="Rename collection">✎</span>
                    <span class="remove-collection" onclick="deleteCollection('${col.id}', event)" title="Delete collection">✕</span>
                </span>
            </button>
        `;
    }).join('');
    
    collectionTabs.innerHTML = collectionTabsHtml;
    
    // Add click handlers
    collectionTabs.querySelectorAll('.collection-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('remove-collection') && !e.target.classList.contains('rename-collection')) {
                selectCollection(tab.dataset.collection);
            }
        });
    });
}

// Update UI visibility based on whether a collection is selected
function updateUIVisibility() {
    const hasCollection = activeCollectionId !== null;
    
    channelTabsContainer.hidden = !hasCollection;
    addChannelSection.hidden = !hasCollection;
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
        const avatar = channelData.avatar || '';
        const color = CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
        // Use cached proxy for avatar to avoid YouTube throttling
        const avatarUrl = avatar ? `/avatar/${encodeURIComponent(ch.handle)}?url=${encodeURIComponent(avatar)}` : '';
        
        return `
            <button class="channel-tab ${activeChannel === String(idx) ? 'active' : ''}" data-channel="${idx}" style="--channel-color: ${color};">
                ${avatarUrl ? `<img src="${avatarUrl}" alt="${title}" class="channel-avatar" loading="lazy">` : `<span class="channel-dot"></span>`}
                ${title}
                <span class="remove-channel" onclick="deleteChannel('${ch.id}', event)" title="Remove channel">✕</span>
            </button>
        `;
    }).join('');
    
    channelTabs.innerHTML = allTab + channelTabsHtml;
    
    // Add click handlers
    channelTabs.querySelectorAll('.channel-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('remove-channel')) {
                setActiveChannel(tab.dataset.channel);
            }
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
                    <h3>No channels added yet</h3>
                    <p>Add a YouTube channel handle above to get started!</p>
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
    const { videoId, title, viewCount, publishedTime, duration, channelTitle, channelColor, channelHandle, channelAvatar } = video;
    // Use cached proxy for thumbnail to avoid YouTube throttling
    const thumbnail = `/img/${encodeURIComponent(channelHandle || 'unknown')}/${videoId}/mqdefault`;
    const showChannelIndicator = channels.length > 1;
    // Use cached proxy for channel avatar
    const avatarUrl = channelAvatar ? `/avatar/${encodeURIComponent(channelHandle)}?url=${encodeURIComponent(channelAvatar)}` : '';
    
    // Escape data for onclick attribute
    const videoData = JSON.stringify({ videoId, title, viewCount, publishedTime, channelTitle }).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    return `
        <article class="video-card" onclick='openVideoModal(${videoData})' style="cursor: pointer;">
            <div class="video-thumbnail">
                ${showChannelIndicator ? `<span class="channel-indicator" style="--channel-color: ${channelColor};">${avatarUrl ? `<img src="${avatarUrl}" alt="" class="channel-indicator-icon">` : ''}${escapeHtml(channelTitle)}</span>` : ''}
                <img src="${thumbnail}" alt="${escapeHtml(title)}" loading="lazy">
                ${duration ? `<span class="video-duration">${escapeHtml(duration)}</span>` : ''}
            </div>
            <div class="video-info">
                <h3 class="video-title">${escapeHtml(title)}</h3>
                <div class="video-meta">
                    ${viewCount ? `<span>👁️ ${escapeHtml(viewCount)}</span>` : ''}
                    ${publishedTime ? `<span>📅 ${escapeHtml(publishedTime)}</span>` : ''}
                </div>
            </div>
        </article>
    `;
}

// Render a short card
function renderShortCard(short) {
    const { videoId, title, viewCount, channelTitle, channelColor, channelHandle, channelAvatar } = short;
    // Use cached proxy for thumbnail to avoid YouTube throttling
    const thumbnail = `/img/${encodeURIComponent(channelHandle || 'unknown')}/${videoId}/oar2`;
    const showChannelIndicator = channels.length > 1;
    // Use cached proxy for channel avatar
    const avatarUrl = channelAvatar ? `/avatar/${encodeURIComponent(channelHandle)}?url=${encodeURIComponent(channelAvatar)}` : '';
    
    // Escape data for onclick attribute
    const shortData = JSON.stringify({ videoId, title: title || 'Untitled Short', viewCount, channelTitle, isShort: true }).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    return `
        <article class="short-card" onclick='openVideoModal(${shortData})' style="cursor: pointer;">
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

function showLoading(show) {
    isLoading = show;
    loadingOverlay.hidden = !show;
}

function setAddButtonLoading(loading) {
    addBtn.disabled = loading;
    addBtn.querySelector('.btn-text').hidden = loading;
    addBtn.querySelector('.btn-loading').hidden = !loading;
    channelInput.disabled = loading;
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
const videoModalLink = document.getElementById('videoModalLink');
const closeVideoModalBtn = document.getElementById('closeVideoModal');

function openVideoModal(videoData) {
    const { videoId, title, viewCount, publishedTime, channelTitle, isShort } = videoData;
    
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
    videoModalDate.textContent = publishedTime ? `📅 ${publishedTime}` : '';
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
