# Testing Guide

This guide covers how to run tests, write new tests, and understand the testing infrastructure for the YouTube Viewer project.

## Overview

The project uses:
- **Bun Test** - Built-in test runner for unit and integration tests
- **Playwright** - End-to-end browser testing

## Quick Start

```bash
# Run all unit tests
bun test tests/unit/

# Run all integration tests
bun test tests/integration/

# Run all E2E tests (requires Playwright browsers installed)
bunx playwright test

# Run tests in watch mode
bun test --watch
```

## Test Directory Structure

```
tests/
├── unit/                    # Unit tests
│   ├── store.test.ts        # Store operations tests
│   ├── channel-processor.test.ts
│   ├── image-cache.test.ts
│   ├── video-enrichment.test.ts
│   └── routes/              # Route handler tests
│       ├── collections.test.ts
│       ├── channels.test.ts
│       └── hidden.test.ts
├── integration/             # Integration tests
│   └── api-flow.test.ts     # Full API flow tests
├── e2e/                     # End-to-end tests
│   ├── collections.spec.ts  # Collection UI tests
│   ├── channels.spec.ts     # Channel UI tests
│   ├── videos.spec.ts       # Video display tests
│   ├── video-modal.spec.ts  # Modal interaction tests
│   ├── hidden-videos.spec.ts
│   ├── responsive.spec.ts   # Responsive design tests
│   └── pages/               # Page Object Models
│       ├── index.ts
│       └── home.page.ts
├── fixtures/                # Test data fixtures
│   ├── youtube-responses/   # Mock YouTube API responses
│   ├── channel-data/        # Sample channel data
│   └── store-data/          # Sample store data
├── mocks/                   # Mock implementations
│   ├── index.ts
│   ├── youtube-api.ts       # Mock YouTube API
│   └── image-cache.ts       # Mock image fetcher/storage
└── utils/                   # Test utilities
    └── index.ts             # Helper functions
```

## Running Tests

### Unit Tests

Unit tests run fast and don't require any external services.

```bash
# Run all unit tests
bun test tests/unit/

# Run a specific test file
bun test tests/unit/store.test.ts

# Run tests matching a pattern
bun test tests/unit/ --test-name-pattern "Store Operations"

# Run in watch mode for development
bun test tests/unit/ --watch
```

### Integration Tests

Integration tests test full API flows but still use in-memory stores.

```bash
# Run all integration tests
bun test tests/integration/

# Run specific integration test
bun test tests/integration/api-flow.test.ts
```

### E2E Tests

E2E tests run in real browsers and require Playwright.

```bash
# Install Playwright browsers (one time)
bunx playwright install

# Run all E2E tests
bunx playwright test

# Run specific test file
bunx playwright test tests/e2e/collections.spec.ts

# Run in specific browser
bunx playwright test --project=chromium
bunx playwright test --project=firefox
bunx playwright test --project=webkit

# Run in headed mode (see the browser)
bunx playwright test --headed

# Run in debug mode
bunx playwright test --debug

# View test report
bunx playwright show-report
```

### Running All Tests

```bash
# Run unit + integration tests
bun test

# Run everything including E2E (for CI)
bun test && bunx playwright test
```

## Writing Tests

### Unit Test Example

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { createInMemoryStore } from '../../website/store';
import { listCollections } from '../../website/routes/collections';

describe('Collections API', () => {
    let store: ReturnType<typeof createInMemoryStore>;

    beforeEach(() => {
        store = createInMemoryStore();
    });

    test('returns empty array when no collections exist', async () => {
        const response = await listCollections({ store });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual([]);
    });
});
```

### Using Mocks

```typescript
import { createMockYouTubeApi } from '../mocks';

test('uses mock YouTube API', async () => {
    const mockApi = createMockYouTubeApi({
        channelPages: new Map([
            ['@TestChannel', '<html>Mock response</html>'],
        ]),
    });

    // Use mockApi in your test
    const html = await mockApi.fetchChannelPage('https://youtube.com/@TestChannel/videos');
    expect(html).toBe('<html>Mock response</html>');
});
```

### Using Fixtures

```typescript
import channelData from '../fixtures/channel-data/sample-channel.json';
import storeData from '../fixtures/store-data/test-store.json';

test('uses fixture data', () => {
    expect(channelData.channel.title).toBe('TechCorp');
    expect(storeData.collections).toHaveLength(2);
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';
import { HomePage } from './pages';

test.describe('Collection Management', () => {
    let homePage: HomePage;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        await homePage.goto();
    });

    test('should create a new collection', async ({ page }) => {
        await homePage.createCollection('Test Collection');
        
        const tab = homePage.getCollectionTab('Test Collection');
        await expect(tab).toBeVisible();
    });
});
```

## Test Utilities

The `tests/utils/index.ts` file provides helpful functions:

```typescript
import {
    createMockCollection,      // Create mock Collection object
    createMockStoredChannel,   // Create mock StoredChannel object
    createMockVideo,           // Create mock Video object
    createMockChannelData,     // Create mock WebChannelData object
    createMockStore,           // Create mock store data
    createMockRequest,         // Create mock Request object
    wait,                      // Wait for specified milliseconds
    randomString,              // Generate random string
} from '../utils';
```

## Mock Implementations

### YouTube API Mock

```typescript
import { createMockYouTubeApi } from '../mocks';

const api = createMockYouTubeApi({
    channelPages: new Map([...]),     // URL -> HTML mapping
    browseData: new Map([...]),       // Token -> Response mapping
    videoDetails: new Map([...]),     // VideoId -> Details mapping
    delay: 100,                       // Simulate network latency
    strictMode: true,                 // Throw on unmatched requests
});

// Track calls for assertions
expect(api.calls.fetchChannelPage).toContain('https://...');
```

### Image Cache Mock

```typescript
import { createMockImageFetcher, createMockImageCacheStorage } from '../mocks';

const fetcher = createMockImageFetcher({
    defaultImage: { data: new Blob([...]), contentType: 'image/jpeg' },
    failUrls: new Set(['https://failing-url.com/image.jpg']),
});

const storage = createMockImageCacheStorage();
// storage.files is a Map<string, Blob> for inspection
```

### In-Memory Store

```typescript
import { createInMemoryStore } from '../../website/store';

const store = createInMemoryStore({
    collections: [
        createMockCollection({ name: 'Test' }),
    ],
});
```

## CI/CD Integration

Tests run automatically on GitHub Actions:

- **On Push to main**: Unit, integration, and E2E tests
- **On Pull Request**: Same tests run as checks

### Workflow Jobs

1. **unit-tests**: Runs `bun test tests/unit/` and `bun test tests/integration/`
2. **e2e-tests**: Runs `bunx playwright test --project=chromium`
3. **type-check**: Runs `bun run tsc --noEmit`

### Viewing Results

- Check the "Actions" tab in GitHub for test results
- Failed E2E tests upload screenshots and reports as artifacts

## Best Practices

### General

1. **Keep tests isolated** - Each test should set up its own data
2. **Use descriptive names** - Test names should describe what is being tested
3. **Test one thing** - Each test should verify a single behavior
4. **Clean up** - Tests should not leave side effects

### Unit Tests

1. **Mock external dependencies** - Don't make real network calls
2. **Test edge cases** - Empty arrays, null values, invalid input
3. **Use the in-memory store** - Never use the file system in unit tests

### E2E Tests

1. **Use Page Object Models** - Encapsulate page interactions
2. **Wait for elements** - Use Playwright's built-in waiting
3. **Handle dynamic content** - Videos may or may not exist
4. **Test at multiple viewports** - Use mobile/tablet sizes

### Integration Tests

1. **Test full flows** - Create -> Read -> Update -> Delete
2. **Test error paths** - 404s, 400s, 409s
3. **Test concurrent operations** - Multiple simultaneous requests

## Troubleshooting

### "Executable doesn't exist" Error

Install Playwright browsers:
```bash
bunx playwright install
```

### Tests Timeout

Increase timeout in test:
```typescript
test('slow test', async () => {
    // ...
}, 30000); // 30 second timeout
```

### E2E Tests Fail Locally but Pass in CI

Check if you have the web server running on port 3000 already:
```bash
# The E2E tests start their own server
# Make sure port 3000 is free
```

### Flaky E2E Tests

Add explicit waits:
```typescript
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500); // Last resort
```
