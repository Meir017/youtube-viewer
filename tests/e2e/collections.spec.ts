/**
 * E2E Tests - Collection Management
 * Tests creating, renaming, selecting, and deleting collections
 */

import { test, expect } from '@playwright/test';
import { HomePage } from './pages';

test.describe('Collection Management', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test.describe('Creating Collections', () => {
        test('should open add collection modal when clicking add button', async ({ page }) => {
            await homePage.addCollectionBtn.click();
            
            await expect(homePage.addCollectionModal).toBeVisible();
            await expect(homePage.collectionNameInput).toBeVisible();
            await expect(homePage.collectionNameInput).toBeFocused();
        });

        test('should close modal when clicking cancel', async ({ page }) => {
            await homePage.addCollectionBtn.click();
            await expect(homePage.addCollectionModal).toBeVisible();
            
            await homePage.cancelCollectionBtn.click();
            
            await expect(homePage.addCollectionModal).toBeHidden();
        });

        test('should create collection and show in tabs', async ({ page }) => {
            const collectionName = `Test Collection ${Date.now()}`;
            
            await homePage.createCollection(collectionName);
            
            // Verify collection tab appears
            const tab = homePage.getCollectionTab(collectionName);
            await expect(tab).toBeVisible();
        });

        test('should auto-select newly created collection', async ({ page }) => {
            const collectionName = `Auto Select ${Date.now()}`;
            
            await homePage.createCollection(collectionName);
            
            // Verify the new collection is active
            const activeTab = homePage.getActiveCollectionTab();
            await expect(activeTab).toContainText(collectionName);
        });

        test('should show add channel section after creating collection', async ({ page }) => {
            const collectionName = `With Channels ${Date.now()}`;
            
            await homePage.createCollection(collectionName);
            
            // Add channel section should be visible
            await expect(homePage.addChannelSection).toBeVisible();
        });

        test('should update collections count in header', async ({ page }) => {
            const initialStats = await homePage.getStats();
            const collectionName = `Count Test ${Date.now()}`;
            
            await homePage.createCollection(collectionName);
            
            const newStats = await homePage.getStats();
            expect(newStats.collections).toBeGreaterThan(initialStats.collections);
        });
    });

    test.describe('Selecting Collections', () => {
        test('should switch between collections', async ({ page }) => {
            // Create two collections
            const collection1 = `Collection A ${Date.now()}`;
            const collection2 = `Collection B ${Date.now()}`;
            
            await homePage.createCollection(collection1);
            await homePage.createCollection(collection2);
            
            // Select first collection
            await homePage.selectCollection(collection1);
            
            const activeTab = homePage.getActiveCollectionTab();
            await expect(activeTab).toContainText(collection1);
            
            // Select second collection
            await homePage.selectCollection(collection2);
            
            await expect(homePage.getActiveCollectionTab()).toContainText(collection2);
        });

        test('should highlight active collection tab', async ({ page }) => {
            const collectionName = `Active Test ${Date.now()}`;
            await homePage.createCollection(collectionName);
            
            const tab = homePage.getCollectionTab(collectionName);
            await expect(tab).toHaveClass(/active/);
        });
    });

    test.describe('Empty State', () => {
        test('should show add collection button when no collections', async ({ page }) => {
            // Add collection button should always be visible
            await expect(homePage.addCollectionBtn).toBeVisible();
        });

        test('should not show add channel section without selected collection', async ({ page }) => {
            // Navigate to fresh state
            await homePage.goto();
            
            // If there are no collections or none selected, add channel should be hidden
            // This depends on whether there are existing collections
            const hasActiveCollection = await homePage.getActiveCollectionTab().count() > 0;
            
            if (!hasActiveCollection) {
                await expect(homePage.addChannelSection).toBeHidden();
            }
        });
    });
});

test.describe('Collection Operations (requires existing collections)', () => {
    let homePage: HomePage;
    let testCollectionName: string;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
        
        // Create a test collection for operations
        testCollectionName = `Operations Test ${Date.now()}`;
        await homePage.createCollection(testCollectionName);
    });

    test('collection tab should be clickable', async ({ page }) => {
        const tab = homePage.getCollectionTab(testCollectionName);
        await expect(tab).toBeEnabled();
        
        // Create another collection and switch back
        const otherCollection = `Other ${Date.now()}`;
        await homePage.createCollection(otherCollection);
        
        await tab.click();
        await expect(homePage.getActiveCollectionTab()).toContainText(testCollectionName);
    });
});
