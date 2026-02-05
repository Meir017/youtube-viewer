# Test Fixtures

This directory contains mock data and fixtures for testing the YouTube Viewer application.

## Directory Structure

- `youtube-responses/` - Mock YouTube API responses
- `channel-data/` - Sample channel data for testing
- `store-data/` - Sample store/collection data for testing

## Usage

Import fixtures in your tests:

```typescript
import channelData from '../fixtures/channel-data/sample-channel.json';
import storeData from '../fixtures/store-data/test-store.json';
```

## Creating New Fixtures

1. Capture real data from the YouTube API during development
2. Redact any sensitive information
3. Save as JSON files with descriptive names
4. Add documentation here explaining the fixture

## Fixture Guidelines

- Keep fixtures as small as possible while still being representative
- Use realistic but fake channel names and video IDs
- Include edge cases (empty arrays, missing fields, etc.)
- Update fixtures when the data structure changes
