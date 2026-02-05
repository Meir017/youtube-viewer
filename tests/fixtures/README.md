# Test Fixtures

This directory contains mock data and fixtures for testing the YouTube Viewer application.

## Directory Structure

```
tests/fixtures/
├── youtube-responses/     # Mock YouTube API responses
│   ├── channel-page.json  # ytInitialData from channel page
│   ├── browse-response.json # Browse API pagination response  
│   └── video-details.json # Video details from watch page
├── channel-data/          # Sample channel data for testing
│   ├── sample-channel.json # Channel with various video types
│   └── empty-channel.json # Edge case: channel with no videos
└── store-data/            # Sample store/collection data
    └── test-store.json    # Store with multiple collections
```

## Usage

Import fixtures in your tests:

```typescript
// Import YouTube API response fixtures
import channelPageData from '../fixtures/youtube-responses/channel-page.json';
import browseResponse from '../fixtures/youtube-responses/browse-response.json';
import videoDetails from '../fixtures/youtube-responses/video-details.json';

// Import channel data fixtures
import sampleChannel from '../fixtures/channel-data/sample-channel.json';
import emptyChannel from '../fixtures/channel-data/empty-channel.json';

// Import store data fixtures
import testStore from '../fixtures/store-data/test-store.json';
```

## Fixture Descriptions

### YouTube Responses

#### `channel-page.json`
Mock `ytInitialData` structure extracted from a YouTube channel page. Contains:
- Channel metadata (title, description, avatar)
- Header information (subscriber count)
- Initial video list in `contents.twoColumnBrowseResultsRenderer.tabs`

#### `browse-response.json`
Mock response from YouTube's Browse API (used for pagination). Contains:
- `onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems`
- Video items and continuation token for next page

#### `video-details.json`
Mock response from YouTube watch page for video enrichment. Contains:
- `videoDetails` with basic video info
- `microformat.playerMicroformatRenderer` with publish date and description

### Channel Data

#### `sample-channel.json`
A realistic channel with various video types:
- Regular videos (with and without enrichment)
- Shorts (isShort: true)
- Old videos (for age filtering tests)
- Long videos (for duration filtering tests)

#### `empty-channel.json`
Edge case fixture for testing channels with no videos.

### Store Data

#### `test-store.json`
Complete store with multiple collections:
- Tech Channels collection with GitHub and TypeScript channels
- Movie Trailers collection with Marvel channel
- Includes hidden videos example
- Mix of enriched and non-enriched videos

## Creating New Fixtures

1. **Capture Real Data**: During development, capture actual YouTube API responses
2. **Sanitize Data**: Remove any sensitive or unnecessary information
3. **Save as JSON**: Use descriptive filenames that indicate the scenario
4. **Add Comments**: Include `$comment` field explaining the fixture
5. **Update README**: Document the new fixture in this file

## Fixture Guidelines

- Keep fixtures as small as possible while still being representative
- Use realistic but fake channel names and video IDs
- Include `$comment` field in JSON to explain the fixture purpose
- Include edge cases (empty arrays, missing fields, etc.)
- Update fixtures when the data structure changes
- Prefer static/predictable IDs over random UUIDs in fixtures

## Example Test Using Fixtures

```typescript
import { describe, test, expect } from 'bun:test';
import channelData from '../fixtures/channel-data/sample-channel.json';
import { calculateEnrichmentStats } from '../../website/video-enrichment';

describe('Enrichment Stats with Fixtures', () => {
    test('counts videos from fixture correctly', () => {
        // Use fixture data
        const stats = calculateEnrichmentStats({
            id: 'test-id',
            name: 'Test',
            channels: [{
                id: 'ch-id',
                handle: channelData.channel.vanityUrl,
                addedAt: new Date().toISOString(),
                data: channelData,
            }],
            createdAt: new Date().toISOString(),
        });

        // fixture has 6 videos: 2 shorts, 2 enriched, 2 unenriched
        expect(stats.shortsCount).toBe(2);
        expect(stats.enrichedVideos).toBe(2);
        expect(stats.totalVideos).toBe(4); // excludes shorts
    });
});
```

## Maintaining Fixtures

When YouTube's API structure changes:
1. Run the application against real YouTube data
2. Capture the new response structure
3. Update the affected fixtures
4. Run all tests to ensure they still pass
5. Update this documentation if the structure changed significantly
