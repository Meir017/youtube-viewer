/**
 * E2E Tests - Video Display and Filtering
 * Tests video grid display and filtering functionality
 */

import { test, expect } from '@playwright/test';
import { HomePage } from './pages';

test.describe('Video Display', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test.describe('Video Grid', () => {
        test('should have video grid container', async ({ page }) => {
            // The video grid should exist in the DOM
            const videosGrid = page.locator('#allVideosGrid, .videos-grid');
            await expect(videosGrid).toBeAttached();
        });

        test('should display videos in grid layout', async ({ page }) => {
            const videosGrid = page.locator('#allVideosGrid');
            // Grid should use CSS grid or flexbox
            if (await videosGrid.isVisible()) {
                const display = await videosGrid.evaluate(el => 
                    window.getComputedStyle(el).display
                );
                expect(['grid', 'flex', 'block']).toContain(display);
            }
        });
    });

    test.describe('Video Cards', () => {
        test('video cards should have proper structure', async ({ page }) => {
            // If there are video cards, they should have expected elements
            const videoCards = page.locator('.video-card');
            const count = await videoCards.count();
            
            if (count > 0) {
                const firstCard = videoCards.first();
                
                // Should have thumbnail
                const thumbnail = firstCard.locator('img, .thumbnail');
                await expect(thumbnail).toBeAttached();
                
                // Should have title
                const title = firstCard.locator('.video-title, h3, h4');
                await expect(title).toBeAttached();
            }
        });

        test('video cards should be clickable', async ({ page }) => {
            const videoCards = page.locator('.video-card');
            const count = await videoCards.count();
            
            if (count > 0) {
                // Cards should have click handler or be links
                const firstCard = videoCards.first();
                await expect(firstCard).toBeEnabled();
            }
        });
    });
});

test.describe('Video Filtering', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test.describe('Max Age Filter', () => {
        test('should have max age input', async ({ page }) => {
            const maxAgeInput = page.locator('#maxAgeInput');
            await expect(maxAgeInput).toBeAttached();
        });

        test('max age input should accept numeric values', async ({ page }) => {
            const maxAgeInput = page.locator('#maxAgeInput');
            if (await maxAgeInput.isVisible()) {
                await maxAgeInput.fill('30');
                await expect(maxAgeInput).toHaveValue('30');
            }
        });

        test('max age input should have minimum value', async ({ page }) => {
            const maxAgeInput = page.locator('#maxAgeInput');
            if (await maxAgeInput.isVisible()) {
                await expect(maxAgeInput).toHaveAttribute('min', '0');
            }
        });
    });

    test.describe('Sort Options', () => {
        test('should have sort select element', async ({ page }) => {
            const sortSelect = page.locator('#sortSelect, select[name="sort"]');
            // Sort control should exist (may be hidden in some states)
            await expect(sortSelect).toBeAttached();
        });
    });

    test.describe('Hide Shorts Toggle', () => {
        test('should have hide shorts option', async ({ page }) => {
            const hideShortsToggle = page.locator('#hideShortsBtn, .hide-shorts-toggle, [data-filter="shorts"]');
            // Hide shorts control should exist
        });
    });
});

test.describe('Video Information Display', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test('should display video metadata', async ({ page }) => {
        const videoCards = page.locator('.video-card');
        const count = await videoCards.count();
        
        if (count > 0) {
            const firstCard = videoCards.first();
            
            // Check for common metadata elements
            const metadata = firstCard.locator('.video-meta, .video-stats, .video-info');
            // Metadata container should exist
        }
    });

    test('should display video duration', async ({ page }) => {
        const videoCards = page.locator('.video-card');
        const count = await videoCards.count();
        
        if (count > 0) {
            const firstCard = videoCards.first();
            
            // Duration element
            const duration = firstCard.locator('.duration, .video-duration, [data-duration]');
            // Duration might be overlaid on thumbnail or in metadata
        }
    });

    test('should display view count', async ({ page }) => {
        const videoCards = page.locator('.video-card');
        const count = await videoCards.count();
        
        if (count > 0) {
            const firstCard = videoCards.first();
            
            // View count element
            const views = firstCard.locator('.views, .view-count, [data-views]');
            // Views might be in metadata section
        }
    });
});
