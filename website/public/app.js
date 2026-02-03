// YouTube Channel Viewer - Client-side JavaScript
const API_BASE = '/api';

// Channel colors for indicators
const CHANNEL_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe'];

// State
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

// DOM Elements
const addChannelForm = document.getElementById('addChannelForm');
const channelInput = document.getElementById('channelInput');
const addBtn = document.getElementById('addBtn');
const errorMessage = document.getElementById('errorMessage');
const loadingOverlay = document.getElementById('loadingOverlay');
const channelTabs = document.getElementById('channelTabs');
const videosGrid = document.getElementById('videosGrid');
const shortsGrid = document.getElementById('shortsGrid');
const searchBox = document.getElementById('searchBox');
const searchBoxShorts = document.getElementById('searchBoxShorts');
const sortButtons = document.querySelectorAll('.sort-btn');
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadChannels();
    addChannelForm.addEventListener('submit', handleAddChannel);
    searchBox.addEventListener('input', handleSearch);
    searchBoxShorts.addEventListener('input', handleSearchShorts);
    
    sortButtons.forEach(btn => {
        btn.addEventListener('click', () => handleSort(btn));
    });
    
    // Catalog filter listeners
    applyMaxAgeBtn.addEventListener('click', handleApplyMaxAge);
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

// Handle max-age apply button (reloads catalog from server)
async function handleApplyMaxAge() {
    const newMaxAge = parseInt(maxAgeInput.value) || 0;
    if (newMaxAge === currentMaxAge) return;
    
    currentMaxAge = newMaxAge;
    applyMaxAgeBtn.disabled = true;
    applyMaxAgeBtn.textContent = '...';
    applyMaxAgeBtn.classList.add('loading');
    
    try {
        await refreshAllChannels();
    } catch (error) {
        showError('Failed to reload channels with new max age');
        console.error('Max age refresh error:', error);
    } finally {
        applyMaxAgeBtn.disabled = false;
        applyMaxAgeBtn.textContent = 'Apply';
        applyMaxAgeBtn.classList.remove('loading');
    }
}

// Refresh all channels with current max-age setting
async function refreshAllChannels() {
    showLoading(true);
    
    try {
        const maxAgeDays = currentMaxAge === 0 ? 36500 : currentMaxAge; // 0 = all time (~100 years)
        const response = await fetch(`${API_BASE}/channels?maxAgeDays=${maxAgeDays}`);
        if (!response.ok) throw new Error('Failed to refresh channels');
        channels = await response.json();
        processChannelData();
        renderAll();
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

// Load channels from API
async function loadChannels() {
    showLoading(true);
    try {
        const response = await fetch(`${API_BASE}/channels`);
        if (!response.ok) throw new Error('Failed to load channels');
        channels = await response.json();
        processChannelData();
        renderAll();
    } catch (error) {
        showError('Failed to load channels. Please refresh the page.');
        console.error('Load error:', error);
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
        
        videos.forEach((v, idx) => {
            const videoWithChannel = {
                ...v,
                channelTitle,
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

// Add a new channel
async function handleAddChannel(e) {
    e.preventDefault();
    
    const handle = channelInput.value.trim();
    if (!handle) return;
    
    setAddButtonLoading(true);
    hideError();
    
    try {
        const response = await fetch(`${API_BASE}/channels`, {
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
        renderAll();
        channelInput.value = '';
    } catch (error) {
        showError(error.message);
        console.error('Add error:', error);
    } finally {
        setAddButtonLoading(false);
    }
}

// Delete a channel
async function deleteChannel(id, e) {
    e.stopPropagation();
    if (!confirm('Remove this channel?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/channels/${id}`, {
            method: 'DELETE',
        });
        
        if (!response.ok) throw new Error('Failed to delete channel');
        
        channels = channels.filter(c => c.id !== id);
        activeChannel = 'all';
        processChannelData();
        renderAll();
    } catch (error) {
        showError('Failed to delete channel');
        console.error('Delete error:', error);
    }
}

// Refresh all channels
async function refreshChannel(id) {
    const tab = document.querySelector(`[data-channel="${channels.findIndex(c => c.id === id)}"]`);
    if (tab) tab.classList.add('refreshing');
    
    try {
        const response = await fetch(`${API_BASE}/channels/${id}/refresh`, {
            method: 'POST',
        });
        
        if (!response.ok) throw new Error('Failed to refresh channel');
        
        const updated = await response.json();
        const index = channels.findIndex(c => c.id === id);
        if (index !== -1) {
            channels[index] = updated;
        }
        processChannelData();
        renderAll();
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
    renderSummaryStats();
    renderChannelTabs();
    renderVideos();
    renderShorts();
}

// Render summary stats
function renderSummaryStats() {
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
        
        return `
            <button class="channel-tab ${activeChannel === String(idx) ? 'active' : ''}" data-channel="${idx}" style="--channel-color: ${color};">
                ${avatar ? `<img src="${escapeHtml(avatar)}" alt="${title}" class="channel-avatar" loading="lazy">` : `<span class="channel-dot"></span>`}
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
    
    videosGrid.innerHTML = sorted.map(video => renderVideoCard(video)).join('');
}

// Render shorts grid
function renderShorts() {
    const filtered = filterShorts(allShorts);
    
    shortsCountEl.textContent = filtered.length;
    
    if (filtered.length === 0) {
        shortsSection.hidden = true;
        return;
    }
    
    shortsSection.hidden = false;
    shortsGrid.innerHTML = filtered.map(short => renderShortCard(short)).join('');
}

// Render a video card
function renderVideoCard(video) {
    const { videoId, title, viewCount, publishedTime, duration, channelTitle, channelColor } = video;
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const showChannelIndicator = channels.length > 1;
    
    return `
        <article class="video-card">
            <a href="${url}" target="_blank" rel="noopener noreferrer">
                <div class="video-thumbnail">
                    ${showChannelIndicator ? `<span class="channel-indicator" style="--channel-color: ${channelColor};">${escapeHtml(channelTitle)}</span>` : ''}
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
            </a>
        </article>
    `;
}

// Render a short card
function renderShortCard(short) {
    const { videoId, title, viewCount, channelTitle, channelColor } = short;
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/oar2.jpg`;
    const url = `https://www.youtube.com/shorts/${videoId}`;
    const showChannelIndicator = channels.length > 1;
    
    return `
        <article class="short-card">
            <a href="${url}" target="_blank" rel="noopener noreferrer">
                <div class="short-thumbnail">
                    <span class="short-badge">Short</span>
                    ${showChannelIndicator ? `<span class="channel-indicator" style="--channel-color: ${channelColor}; top: 35px;">${escapeHtml(channelTitle)}</span>` : ''}
                    <img src="${thumbnail}" alt="${escapeHtml(title)}" loading="lazy">
                </div>
                <div class="short-info">
                    <h3 class="short-title">${escapeHtml(title || 'Untitled Short')}</h3>
                    <div class="short-meta">
                        ${viewCount ? `<span>👁️ ${escapeHtml(viewCount)}</span>` : ''}
                    </div>
                </div>
            </a>
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
