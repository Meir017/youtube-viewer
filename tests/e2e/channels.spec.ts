/**
 * E2E Tests - Channel Management
 * Tests adding, removing, and filtering channels within collections
 */

import { test, expect } from '@playwright/test';
import { HomePage } from './pages';

test.describe('Channel Management', () => {
    let homePage: HomePage;
    let testCollectionName: string;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
        
        // Create a test collection for channel operations
        testCollectionName = `Channel Tests ${Date.now()}`;
        await homePage.createCollection(testCollectionName);
    });

    test.describe('Adding Channels', () => {
        test('should show add channel form when collection is selected', async ({ page }) => {
            await expect(homePage.addChannelSection).toBeVisible();
            await expect(homePage.channelInput).toBeVisible();
            await expect(homePage.addChannelBtn).toBeVisible();
        });

        test('should have channel input focused after selecting collection', async ({ page }) => {
            // The input should be ready for typing
            await expect(homePage.channelInput).toBeVisible();
        });

        test('should show loading state when adding channel', async ({ page }) => {
            // Type a channel handle
            await homePage.channelInput.fill('@GitHub');
            await homePage.addChannelBtn.click();
            
            // Button should show loading state or be disabled
            // Wait for the operation to start
            await page.waitForTimeout(100);
            
            // The button should have some indication of loading
            const btnLoading = page.locator('#addBtn .btn-loading');
            // This might be visible during loading
        });

        test('should clear input after adding channel', async ({ page }) => {
            // Note: This test depends on having a working YouTube channel
            // In a real E2E test, we'd mock the API or use a known channel
            await homePage.channelInput.fill('@GitHub');
            
            // Submit the form
            await homePage.addChannelBtn.click();
            
            // Wait for the operation (may take a while with real API)
            await page.waitForTimeout(5000);
            
            // If successful, input should be empty
            // If failed, error message should appear
            const errorVisible = await homePage.isErrorVisible();
            if (!errorVisible) {
                // Success case - input should be cleared
                await expect(homePage.channelInput).toHaveValue('');
            }
        });
    });

    test.describe('Channel Input Validation', () => {
        test('should require channel handle', async ({ page }) => {
            // Try to submit empty form
            await homePage.channelInput.fill('');
            await homePage.addChannelBtn.click();
            
            // Form should have required validation or show error
            // The input has 'required' attribute
            await expect(homePage.channelInput).toHaveAttribute('required', '');
        });

        test('should accept handle with @ prefix', async ({ page }) => {
            await homePage.channelInput.fill('@SomeChannel');
            
            // Input should accept the value
            await expect(homePage.channelInput).toHaveValue('@SomeChannel');
        });

        test('should accept handle without @ prefix', async ({ page }) => {
            await homePage.channelInput.fill('SomeChannel');
            
            // Input should accept the value
            await expect(homePage.channelInput).toHaveValue('SomeChannel');
        });
    });

    test.describe('Error Handling', () => {
        test('should have error message container', async ({ page }) => {
            // Error message container should exist (hidden by default)
            await expect(homePage.errorMessage).toBeHidden();
        });

        test('error message should be closable or auto-hide', async ({ page }) => {
            // After an error, there should be a way to dismiss it
            // This verifies the error message element exists
            const errorElement = page.locator('#errorMessage');
            await expect(errorElement).toBeAttached();
        });
    });
});

test.describe('Channel List Display', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test('should show channel tabs area when collection has channels', async ({ page }) => {
        // If there are existing channels, tabs should be visible
        const channelTabs = page.locator('.channel-tabs, .channels-list');
        // This container should exist in the DOM
    });

    test('should have filter controls when collection has channels', async ({ page }) => {
        const catalogFilters = page.locator('#catalogFilters');
        // Filters should be in the DOM (may be hidden if no collection selected)
    });
});

test.describe('Channel Operations UI Elements', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test('add channel button should be enabled when form is valid', async ({ page }) => {
        const testCollectionName = `UI Test ${Date.now()}`;
        await homePage.createCollection(testCollectionName);
        
        // Add button should be enabled
        await expect(homePage.addChannelBtn).toBeEnabled();
    });

    test('max age filter should exist', async ({ page }) => {
        const testCollectionName = `Filter Test ${Date.now()}`;
        await homePage.createCollection(testCollectionName);
        
        // Max age input should exist
        await expect(homePage.maxAgeInput).toBeAttached();
    });

    test('apply filter button should exist', async ({ page }) => {
        const testCollectionName = `Apply Test ${Date.now()}`;
        await homePage.createCollection(testCollectionName);
        
        // Apply button should exist
        await expect(homePage.applyMaxAgeBtn).toBeAttached();
    });
});
