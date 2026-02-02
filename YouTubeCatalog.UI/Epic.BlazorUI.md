Epic: Blazor UI

Overview

This epic covers the Blazor UI for the YouTube Catalog application. The UI provides a Catalog page where users can input channels, choose Top X and days Y, and view top videos aggregated from selected channels within the specified date range. It includes channel discovery, validation, responsive video results, caching indicators, pagination, and accessibility considerations.

Goals

- Provide a responsive, accessible Catalog page integrated with the API.
- Allow selecting channels via manual input or typeahead search and parsing of pasted URLs.
- Provide friendly loading, empty, and error states with retry options.
- Implement per-channel status and caching metadata.
- Add bUnit component tests for critical components.

Deliverables

- Catalog.razor page and supporting components: ChannelPicker, VideoResults, CatalogApiClient, Models, scoped CSS.
- Channel validation utilities and integration with GET /api/channels/search.
- bUnit tests for Catalog and VideoResults components.
- Navigation entry and usage documentation in tasks.md

Phases & Tasks

1. Scaffolding
   - Create Catalog page and route
   - Add DI registration for CatalogApiClient
2. Inputs & Validation
   - ChannelPicker: manual multiline input, chips, typeahead
   - Validate channel IDs and extract channelId from URLs
3. API Integration
   - Implement Models for request/response
   - Post to /api/catalog/query and handle timeouts/errors
4. Results UI
   - Responsive grid of video cards with thumbnails and metadata
   - Pagination (20 items per page) and per-channel status section
5. Testing
   - Add bUnit tests for components and critical flows
   - Add sample mocked responses for integration tests
6. Accessibility & polish
   - Keyboard navigation for chips and typeahead
   - ARIA labels for controls and results

Acceptance Criteria

- POST /api/catalog/query is wired and returns usable results in the Catalog page
- Channel input handles pasted URLs and validates IDs
- Results display thumbnails, titles, channels, view counts, publish dates, and descriptions
- Loading, empty, and error states are present and test-covered
- Navigation includes link to Catalog page

Notes

Optional enhancements like keyboard shortcuts and more exhaustive bUnit tests are tracked separately and not required for initial acceptance.
