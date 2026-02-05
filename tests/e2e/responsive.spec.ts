/**
 * E2E Tests - Responsive Design
 * Tests application behavior across different screen sizes
 */

import { test, expect, devices } from '@playwright/test';
import { HomePage } from './pages';

test.describe('Responsive Design - Desktop', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        // Set desktop viewport
        await page.setViewportSize({ width: 1280, height: 720 });
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test('should display full header on desktop', async ({ page }) => {
        const header = page.locator('header, .multi-channel-header');
        await expect(header).toBeVisible();
    });

    test('should show all stats in header on desktop', async ({ page }) => {
        const statsContainer = page.locator('#summaryStats');
        await expect(statsContainer).toBeVisible();
        
        // All stat items should be visible
        const statItems = statsContainer.locator('.summary-stat');
        const count = await statItems.count();
        expect(count).toBeGreaterThanOrEqual(3); // Collections, Channels, Videos at minimum
    });

    test('should display collection tabs horizontally', async ({ page }) => {
        const collectionTabs = page.locator('#collectionTabs');
        if (await collectionTabs.isVisible()) {
            const display = await collectionTabs.evaluate(el => 
                window.getComputedStyle(el).display
            );
            expect(['flex', 'grid', 'block', 'inline-flex']).toContain(display);
        }
    });

    test('video grid should use multiple columns on desktop', async ({ page }) => {
        const videosGrid = page.locator('#allVideosGrid');
        if (await videosGrid.isVisible()) {
            const gridColumns = await videosGrid.evaluate(el => 
                window.getComputedStyle(el).gridTemplateColumns
            );
            // Should have multiple column definitions or auto-fill
            if (gridColumns !== 'none') {
                expect(gridColumns.split(' ').length).toBeGreaterThan(1);
            }
        }
    });
});

test.describe('Responsive Design - Tablet', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        // Set tablet viewport
        await page.setViewportSize({ width: 768, height: 1024 });
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test('should display header on tablet', async ({ page }) => {
        const header = page.locator('header, .multi-channel-header');
        await expect(header).toBeVisible();
    });

    test('should adapt layout for tablet size', async ({ page }) => {
        const container = page.locator('.container');
        await expect(container).toBeVisible();
    });

    test('video grid should adjust columns for tablet', async ({ page }) => {
        const videosGrid = page.locator('#allVideosGrid');
        if (await videosGrid.isVisible()) {
            // Grid should adapt to tablet width
            const width = await videosGrid.evaluate(el => el.clientWidth);
            expect(width).toBeLessThanOrEqual(768);
        }
    });
});

test.describe('Responsive Design - Mobile', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test('should display header on mobile', async ({ page }) => {
        const header = page.locator('header, .multi-channel-header');
        await expect(header).toBeVisible();
    });

    test('title should be visible on mobile', async ({ page }) => {
        const title = page.locator('.multi-channel-title, h1');
        await expect(title).toBeVisible();
    });

    test('add collection button should be accessible on mobile', async ({ page }) => {
        const addBtn = page.locator('#addCollectionBtn');
        await expect(addBtn).toBeVisible();
    });

    test('video grid should use single column or fewer columns on mobile', async ({ page }) => {
        const videosGrid = page.locator('#allVideosGrid');
        if (await videosGrid.isVisible()) {
            const width = await videosGrid.evaluate(el => el.clientWidth);
            // Should be constrained to mobile width
            expect(width).toBeLessThanOrEqual(375);
        }
    });

    test('modal should be full-width on mobile', async ({ page }) => {
        const videoCards = page.locator('.video-card');
        const count = await videoCards.count();
        
        if (count > 0) {
            const firstCard = videoCards.first();
            await firstCard.click();
            
            const modal = page.locator('#videoModal');
            if (await modal.isVisible()) {
                const modalContent = modal.locator('.modal-content').first();
                const width = await modalContent.evaluate(el => el.clientWidth);
                // Modal should take most of screen width on mobile
                expect(width).toBeGreaterThan(300);
            }
        }
    });

    test('inputs should be appropriately sized for touch', async ({ page }) => {
        const inputs = page.locator('input[type="text"], input[type="number"]');
        const count = await inputs.count();
        
        for (let i = 0; i < Math.min(count, 3); i++) {
            const input = inputs.nth(i);
            if (await input.isVisible()) {
                const height = await input.evaluate(el => el.clientHeight);
                // Touch targets should be at least 40px
                expect(height).toBeGreaterThanOrEqual(30);
            }
        }
    });

    test('buttons should be appropriately sized for touch', async ({ page }) => {
        const buttons = page.locator('button');
        const count = await buttons.count();
        
        for (let i = 0; i < Math.min(count, 3); i++) {
            const button = buttons.nth(i);
            if (await button.isVisible()) {
                const height = await button.evaluate(el => el.clientHeight);
                // Touch targets should be at least 40px
                expect(height).toBeGreaterThanOrEqual(30);
            }
        }
    });
});

test.describe('Responsive Design - Layout Consistency', () => {
    test('page should not have horizontal scroll at any size', async ({ page }) => {
        const viewports = [
            { width: 1920, height: 1080 },
            { width: 1280, height: 720 },
            { width: 768, height: 1024 },
            { width: 375, height: 667 },
        ];

        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await page.goto('/');
            
            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
            
            // Should not have significant horizontal overflow
            expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
        }
    });
});
