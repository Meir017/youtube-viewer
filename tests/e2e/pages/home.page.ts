/**
 * Page Object Model for the Home Page (main application page)
 * Provides methods for interacting with the YouTube Channel Viewer UI
 */

import { Page, Locator, expect } from '@playwright/test';

export class HomePage {
    readonly page: Page;

    // Header elements
    readonly title: Locator;
    readonly collectionsCount: Locator;
    readonly channelsCount: Locator;
    readonly videosCount: Locator;
    readonly shortsCount: Locator;
    readonly hiddenCount: Locator;

    // Collection tabs
    readonly collectionTabs: Locator;
    readonly addCollectionBtn: Locator;

    // Add Collection Modal
    readonly addCollectionModal: Locator;
    readonly collectionNameInput: Locator;
    readonly createCollectionBtn: Locator;
    readonly cancelCollectionBtn: Locator;

    // Rename Collection Modal
    readonly renameCollectionModal: Locator;
    readonly renameCollectionInput: Locator;
    readonly renameSubmitBtn: Locator;
    readonly cancelRenameBtn: Locator;

    // Add Channel Section
    readonly addChannelSection: Locator;
    readonly channelInput: Locator;
    readonly addChannelBtn: Locator;
    readonly errorMessage: Locator;

    // Filters
    readonly catalogFilters: Locator;
    readonly maxAgeInput: Locator;
    readonly applyMaxAgeBtn: Locator;

    // Videos grid
    readonly videosGrid: Locator;
    readonly videoCards: Locator;

    // Video Modal
    readonly videoModal: Locator;
    readonly videoModalClose: Locator;

    constructor(page: Page) {
        this.page = page;

        // Header elements
        this.title = page.locator('.multi-channel-title');
        this.collectionsCount = page.locator('#totalCollections');
        this.channelsCount = page.locator('#totalChannels');
        this.videosCount = page.locator('#totalVideos');
        this.shortsCount = page.locator('#totalShorts');
        this.hiddenCount = page.locator('#totalHidden');

        // Collection tabs
        this.collectionTabs = page.locator('#collectionTabs');
        this.addCollectionBtn = page.locator('#addCollectionBtn');

        // Add Collection Modal
        this.addCollectionModal = page.locator('#addCollectionModal');
        this.collectionNameInput = page.locator('#collectionNameInput');
        this.createCollectionBtn = page.locator('#addCollectionForm button[type="submit"]');
        this.cancelCollectionBtn = page.locator('#cancelCollectionBtn');

        // Rename Collection Modal
        this.renameCollectionModal = page.locator('#renameCollectionModal');
        this.renameCollectionInput = page.locator('#renameCollectionInput');
        this.renameSubmitBtn = page.locator('#renameCollectionForm button[type="submit"]');
        this.cancelRenameBtn = page.locator('#cancelRenameBtn');

        // Add Channel Section
        this.addChannelSection = page.locator('#addChannelSection');
        this.channelInput = page.locator('#channelInput');
        this.addChannelBtn = page.locator('#addBtn');
        this.errorMessage = page.locator('#errorMessage');

        // Filters
        this.catalogFilters = page.locator('#catalogFilters');
        this.maxAgeInput = page.locator('#maxAgeInput');
        this.applyMaxAgeBtn = page.locator('#applyMaxAgeBtn');

        // Videos grid
        this.videosGrid = page.locator('#allVideosGrid');
        this.videoCards = page.locator('.video-card');

        // Video Modal
        this.videoModal = page.locator('#videoModal');
        this.videoModalClose = page.locator('#videoModal .close-btn');
    }

    /**
     * Navigate to the home page
     */
    async goto() {
        await this.page.goto('/');
        await this.page.waitForLoadState('networkidle');
    }

    /**
     * Wait for the page to finish loading data
     */
    async waitForDataLoad() {
        await this.page.waitForLoadState('networkidle');
    }

    /**
     * Create a new collection
     */
    async createCollection(name: string) {
        await this.addCollectionBtn.click();
        await expect(this.addCollectionModal).toBeVisible();
        await this.collectionNameInput.fill(name);
        await this.createCollectionBtn.click();
        await expect(this.addCollectionModal).toBeHidden();
        await this.waitForDataLoad();
    }

    /**
     * Select a collection tab by name
     */
    async selectCollection(name: string) {
        const tab = this.collectionTabs.locator(`.collection-tab:has-text("${name}")`);
        await tab.click();
        await this.waitForDataLoad();
    }

    /**
     * Get the active collection tab
     */
    getActiveCollectionTab() {
        return this.collectionTabs.locator('.collection-tab.active');
    }

    /**
     * Add a channel to the currently selected collection
     */
    async addChannel(handle: string) {
        await expect(this.addChannelSection).toBeVisible();
        await this.channelInput.fill(handle);
        await this.addChannelBtn.click();
        // Wait for the channel to be added (loading state)
        await this.page.waitForTimeout(500);
    }

    /**
     * Get collection tab by name
     */
    getCollectionTab(name: string) {
        return this.collectionTabs.locator(`.collection-tab:has-text("${name}")`);
    }

    /**
     * Open rename modal for a collection
     */
    async openRenameModal(collectionName: string) {
        const tab = this.getCollectionTab(collectionName);
        await tab.click({ button: 'right' });
        const renameOption = this.page.locator('.context-menu-item:has-text("Rename")');
        await renameOption.click();
        await expect(this.renameCollectionModal).toBeVisible();
    }

    /**
     * Rename the collection in the rename modal
     */
    async renameCollection(newName: string) {
        await this.renameCollectionInput.fill(newName);
        await this.renameSubmitBtn.click();
        await expect(this.renameCollectionModal).toBeHidden();
        await this.waitForDataLoad();
    }

    /**
     * Delete a collection via context menu
     */
    async deleteCollection(collectionName: string) {
        const tab = this.getCollectionTab(collectionName);
        await tab.click({ button: 'right' });
        const deleteOption = this.page.locator('.context-menu-item:has-text("Delete")');
        await deleteOption.click();
        await this.waitForDataLoad();
    }

    /**
     * Get the count of visible video cards
     */
    async getVideoCardsCount() {
        return this.videoCards.count();
    }

    /**
     * Click on a video card to open the modal
     */
    async openVideoModal(videoTitle: string) {
        const videoCard = this.page.locator(`.video-card:has-text("${videoTitle}")`);
        await videoCard.click();
        await expect(this.videoModal).toBeVisible();
    }

    /**
     * Close the video modal
     */
    async closeVideoModal() {
        await this.videoModalClose.click();
        await expect(this.videoModal).toBeHidden();
    }

    /**
     * Get header stats
     */
    async getStats() {
        return {
            collections: parseInt(await this.collectionsCount.textContent() || '0'),
            channels: parseInt(await this.channelsCount.textContent() || '0'),
            videos: parseInt(await this.videosCount.textContent() || '0'),
        };
    }

    /**
     * Apply max age filter
     */
    async applyMaxAgeFilter(days: number) {
        await this.maxAgeInput.fill(days.toString());
        await this.applyMaxAgeBtn.click();
        await this.waitForDataLoad();
    }

    /**
     * Check if error message is displayed
     */
    async isErrorVisible() {
        return this.errorMessage.isVisible();
    }

    /**
     * Get error message text
     */
    async getErrorMessage() {
        return this.errorMessage.textContent();
    }
}
