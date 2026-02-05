/**
 * Sample E2E test to verify Playwright setup
 */

import { test, expect } from '@playwright/test';

test.describe('Sample E2E Tests', () => {
    test('homepage loads successfully', async ({ page }) => {
        await page.goto('/');
        
        // Verify the page title exists
        await expect(page).toHaveTitle(/YouTube Viewer/i);
    });

    test('collections container exists', async ({ page }) => {
        await page.goto('/');
        
        // The collections list or empty state should be visible
        const collectionsArea = page.locator('#collections-list, .empty-state, .collections-tabs');
        await expect(collectionsArea.first()).toBeVisible();
    });
});
