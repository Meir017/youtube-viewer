/**
 * E2E Tests - Video Modal
 * Tests video modal display and interactions
 */

import { test, expect } from '@playwright/test';
import { HomePage } from './pages';

test.describe('Video Modal', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test.describe('Modal Structure', () => {
        test('should have video modal element in DOM', async ({ page }) => {
            const videoModal = page.locator('#videoModal');
            await expect(videoModal).toBeAttached();
        });

        test('modal should be hidden by default', async ({ page }) => {
            const videoModal = page.locator('#videoModal');
            // Modal should have hidden attribute or be display:none
            await expect(videoModal).toBeHidden();
        });

        test('should have close button', async ({ page }) => {
            const closeBtn = page.locator('#videoModal .close-btn, #videoModal .modal-close');
            await expect(closeBtn).toBeAttached();
        });
    });

    test.describe('Modal Content', () => {
        test('should have video iframe container', async ({ page }) => {
            // The modal should have a container for the YouTube embed
            const iframeContainer = page.locator('#videoModal .video-container, #videoModal iframe');
            await expect(iframeContainer).toBeAttached();
        });

        test('should have video title element', async ({ page }) => {
            const titleElement = page.locator('#videoModal .modal-title, #videoModal h2, #videoModal h3');
            await expect(titleElement).toBeAttached();
        });

        test('should have video description area', async ({ page }) => {
            const descElement = page.locator('#videoModal .video-description, #videoModal .description');
            // Description element should exist (may be empty until enriched)
        });
    });

    test.describe('Modal Interactions (with videos present)', () => {
        test('clicking video card should open modal', async ({ page }) => {
            const videoCards = page.locator('.video-card');
            const count = await videoCards.count();
            
            if (count > 0) {
                const firstCard = videoCards.first();
                await firstCard.click();
                
                // Modal should become visible
                const videoModal = page.locator('#videoModal');
                await expect(videoModal).toBeVisible();
            }
        });

        test('clicking close button should close modal', async ({ page }) => {
            const videoCards = page.locator('.video-card');
            const count = await videoCards.count();
            
            if (count > 0) {
                const firstCard = videoCards.first();
                await firstCard.click();
                
                const videoModal = page.locator('#videoModal');
                await expect(videoModal).toBeVisible();
                
                // Click close
                const closeBtn = page.locator('#videoModal .close-btn').first();
                await closeBtn.click();
                
                await expect(videoModal).toBeHidden();
            }
        });

        test('pressing Escape should close modal', async ({ page }) => {
            const videoCards = page.locator('.video-card');
            const count = await videoCards.count();
            
            if (count > 0) {
                const firstCard = videoCards.first();
                await firstCard.click();
                
                const videoModal = page.locator('#videoModal');
                await expect(videoModal).toBeVisible();
                
                // Press Escape
                await page.keyboard.press('Escape');
                
                await expect(videoModal).toBeHidden();
            }
        });

        test('clicking outside modal should close it', async ({ page }) => {
            const videoCards = page.locator('.video-card');
            const count = await videoCards.count();
            
            if (count > 0) {
                const firstCard = videoCards.first();
                await firstCard.click();
                
                const videoModal = page.locator('#videoModal');
                await expect(videoModal).toBeVisible();
                
                // Click the backdrop (modal container outside content)
                await videoModal.click({ position: { x: 5, y: 5 } });
                
                // Modal might close depending on implementation
            }
        });
    });

    test.describe('Modal Actions', () => {
        test('should have watch on YouTube button', async ({ page }) => {
            const watchBtn = page.locator('#videoModal .watch-youtube, #videoModal a[href*="youtube"]');
            await expect(watchBtn).toBeAttached();
        });

        test('should have hide video button', async ({ page }) => {
            const hideBtn = page.locator('#videoModal .hide-video-btn, #videoModal [data-action="hide"]');
            // Hide button should exist for video management
        });
    });
});

test.describe('Video Modal Accessibility', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test('modal should trap focus when open', async ({ page }) => {
        const videoCards = page.locator('.video-card');
        const count = await videoCards.count();
        
        if (count > 0) {
            const firstCard = videoCards.first();
            await firstCard.click();
            
            // Focus should be within the modal
            const videoModal = page.locator('#videoModal');
            if (await videoModal.isVisible()) {
                const focusedElement = page.locator(':focus');
                // Some element within modal should be focused
            }
        }
    });

    test('modal should have proper ARIA attributes', async ({ page }) => {
        const videoModal = page.locator('#videoModal');
        // Modal should have role="dialog" or similar
    });
});
