// YouTube Channel Viewer - Client-side JavaScript
const API_BASE = '/api';

// State
let channels = [];
let isLoading = false;

// DOM Elements
const addChannelForm = document.getElementById('addChannelForm');
const channelInput = document.getElementById('channelInput');
const addBtn = document.getElementById('addBtn');
const errorMessage = document.getElementById('errorMessage');
const channelList = document.getElementById('channelList');
const loadingOverlay = document.getElementById('loadingOverlay');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadChannels();
    addChannelForm.addEventListener('submit', handleAddChannel);
});

// Load channels from API
async function loadChannels() {
    showLoading(true);
    try {
        const response = await fetch(`${API_BASE}/channels`);
        if (!response.ok) throw new Error('Failed to load channels');
        channels = await response.json();
        renderChannels();
    } catch (error) {
        showError('Failed to load channels. Please refresh the page.');
        console.error('Load error:', error);
    } finally {
        showLoading(false);
    }
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
        renderChannels();
        channelInput.value = '';
    } catch (error) {
        showError(error.message);
        console.error('Add error:', error);
    } finally {
        setAddButtonLoading(false);
    }
}

// Delete a channel
async function deleteChannel(id) {
    if (!confirm('Are you sure you want to remove this channel?')) return;
    
    const btn = document.querySelector(`[data-delete-id="${id}"]`);
    if (btn) btn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/channels/${id}`, {
            method: 'DELETE',
        });
        
        if (!response.ok) throw new Error('Failed to delete channel');
        
        channels = channels.filter(c => c.id !== id);
        renderChannels();
    } catch (error) {
        showError('Failed to delete channel');
        console.error('Delete error:', error);
        if (btn) btn.disabled = false;
    }
}

// Refresh a channel's data
async function refreshChannel(id) {
    const btn = document.querySelector(`[data-refresh-id="${id}"]`);
    const section = document.querySelector(`[data-channel-id="${id}"]`);
    
    if (btn) btn.disabled = true;
    if (section) {
        const grid = section.querySelector('.videos-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="channel-loading" style="grid-column: 1/-1;">
                    <div class="loading-spinner"></div>
                    <span>Refreshing videos...</span>
                </div>
            `;
        }
    }
    
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
        renderChannels();
    } catch (error) {
        showError('Failed to refresh channel');
        console.error('Refresh error:', error);
        renderChannels(); // Re-render to restore state
    }
}

// Render all channels
function renderChannels() {
    if (channels.length === 0) {
        channelList.innerHTML = `
            <div class="empty-state">
                <h3>No channels added yet</h3>
                <p>Add a YouTube channel handle above to get started!</p>
            </div>
        `;
        return;
    }
    
    channelList.innerHTML = channels.map(ch => renderChannel(ch)).join('');
}

// Render a single channel section
function renderChannel(channel) {
    const { id, handle, data, lastUpdated } = channel;
    const channelData = data?.channel || {};
    const videos = data?.videos || [];
    
    const avatar = channelData.avatar || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23333" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".35em" fill="%23fff" font-size="40">?</text></svg>';
    const title = escapeHtml(channelData.title || handle);
    const subscribers = channelData.subscriberCount || 'N/A';
    const videoCount = channelData.videoCount || 'N/A';
    
    const lastUpdatedStr = lastUpdated 
        ? new Date(lastUpdated).toLocaleString() 
        : 'Never';
    
    return `
        <section class="channel-section" data-channel-id="${id}">
            <div class="channel-header">
                <div class="channel-info">
                    <img src="${escapeHtml(avatar)}" alt="${title}" class="channel-avatar" loading="lazy">
                    <div class="channel-details">
                        <h2>${title}</h2>
                        <div class="handle">${escapeHtml(handle)}</div>
                        <div class="channel-stats">
                            <span>👥 ${escapeHtml(subscribers)}</span>
                            <span>🎬 ${escapeHtml(videoCount)}</span>
                            <span>🔄 ${escapeHtml(lastUpdatedStr)}</span>
                        </div>
                    </div>
                </div>
                <div class="channel-actions">
                    <button class="btn-refresh" data-refresh-id="${id}" onclick="refreshChannel('${id}')">
                        🔄 Refresh
                    </button>
                    <button class="btn-delete" data-delete-id="${id}" onclick="deleteChannel('${id}')">
                        🗑️ Remove
                    </button>
                </div>
            </div>
            
            ${videos.length > 0 ? `
                <div class="videos-grid">
                    ${videos.map(v => renderVideoCard(v)).join('')}
                </div>
            ` : `
                <div class="no-videos">No videos found for this channel</div>
            `}
        </section>
    `;
}

// Render a video card
function renderVideoCard(video) {
    const { videoId, title, viewCount, publishedTime, duration } = video;
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    return `
        <div class="video-card">
            <a href="${url}" target="_blank" rel="noopener noreferrer">
                <div class="video-thumbnail">
                    <img src="${thumbnail}" alt="${escapeHtml(title)}" loading="lazy">
                    ${duration ? `<span class="video-duration">${escapeHtml(duration)}</span>` : ''}
                </div>
                <div class="video-info">
                    <div class="video-title">${escapeHtml(title)}</div>
                    <div class="video-meta">
                        ${viewCount ? `<span>${escapeHtml(viewCount)}</span>` : ''}
                        ${publishedTime ? `<span>${escapeHtml(publishedTime)}</span>` : ''}
                    </div>
                </div>
            </a>
        </div>
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
