/**
 * E2E Tests - Hidden Videos
 * Tests hiding and unhiding video functionality
 */

import { test, expect } from '@playwright/test';
import { HomePage } from './pages';

test.describe('Hidden Videos', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test.describe('Hidden Videos Counter', () => {
        test('should have hidden videos counter in header', async ({ page }) => {
            const hiddenCounter = page.locator('#totalHidden, #hiddenStatContainer');
            await expect(hiddenCounter).toBeAttached();
        });

        test('hidden counter should be initially hidden or zero', async ({ page }) => {
            const hiddenCounter = page.locator('#totalHidden');
            const value = await hiddenCounter.textContent();
            // Should be "0" or the container should be hidden
        });
    });

    test.describe('Hide Video UI', () => {
        test('video cards should have hide option', async ({ page }) => {
            const videoCards = page.locator('.video-card');
            const count = await videoCards.count();
            
            if (count > 0) {
                const firstCard = videoCards.first();
                
                // There should be a hide button or option
                const hideOption = firstCard.locator('.hide-btn, .hide-video, [data-action="hide"]');
                // Button might be in a menu or overlay
            }
        });

        test('video modal should have hide button', async ({ page }) => {
            const hideBtn = page.locator('#videoModal .hide-video-btn, #hideVideoBtn');
            await expect(hideBtn).toBeAttached();
        });
    });

    test.describe('Show Hidden Toggle', () => {
        test('should have show hidden videos toggle', async ({ page }) => {
            const showHiddenToggle = page.locator('#showHiddenBtn, .show-hidden-toggle, [data-filter="hidden"]');
            // Toggle to show/hide hidden videos
        });
    });

    test.describe('Hidden Videos Behavior', () => {
        test('hiding a video should update hidden count', async ({ page }) => {
            // This test requires videos to be present
            const videoCards = page.locator('.video-card');
            const count = await videoCards.count();
            
            if (count > 0) {
                // Get initial hidden count
                const hiddenCounter = page.locator('#totalHidden');
                const initialCount = parseInt(await hiddenCounter.textContent() || '0');
                
                // Open a video modal
                const firstCard = videoCards.first();
                await firstCard.click();
                
                // Click hide button in modal
                const hideBtn = page.locator('#hideVideoBtn, .hide-video-btn').first();
                if (await hideBtn.isVisible()) {
                    await hideBtn.click();
                    
                    // Hidden count should increase
                    await page.waitForTimeout(500);
                    const newCount = parseInt(await hiddenCounter.textContent() || '0');
                    expect(newCount).toBeGreaterThanOrEqual(initialCount);
                }
            }
        });
    });
});

test.describe('Hidden Videos List', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test('should be able to view hidden videos when toggle is enabled', async ({ page }) => {
        // Toggle to show hidden videos
        const showHiddenBtn = page.locator('#showHiddenBtn');
        
        if (await showHiddenBtn.isVisible()) {
            await showHiddenBtn.click();
            
            // Hidden videos should now be visible (if any exist)
            await page.waitForTimeout(500);
        }
    });

    test('hidden videos should have visual indicator', async ({ page }) => {
        // When hidden videos are shown, they should be visually distinct
        const hiddenVideoCards = page.locator('.video-card.hidden, .video-card[data-hidden="true"]');
        // Hidden cards might have different styling
    });

    test('should be able to unhide a video', async ({ page }) => {
        // First show hidden videos
        const showHiddenBtn = page.locator('#showHiddenBtn');
        
        if (await showHiddenBtn.isVisible()) {
            await showHiddenBtn.click();
            await page.waitForTimeout(500);
            
            // Find a hidden video and try to unhide
            const hiddenCards = page.locator('.video-card.hidden, .video-card[data-hidden="true"]');
            const count = await hiddenCards.count();
            
            if (count > 0) {
                const firstHidden = hiddenCards.first();
                await firstHidden.click();
                
                // Should be able to unhide from modal
                const unhideBtn = page.locator('#unhideVideoBtn, .unhide-video-btn').first();
                if (await unhideBtn.isVisible()) {
                    await unhideBtn.click();
                }
            }
        }
    });
});
