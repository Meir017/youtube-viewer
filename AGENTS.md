# AGENTS.md

## Project Overview

YouTube Viewer is a Bun/TypeScript CLI tool for fetching and aggregating videos from multiple YouTube channels. It can generate static HTML pages or run an interactive web server.

## Setup Commands

```bash
# Install dependencies
bun install

# Run CLI tool
bun run start

# Start web server
bun run web
```

## Build & Development

This project uses [Bun](https://bun.sh/) as the runtime and package manager. No separate build step is required - TypeScript files are executed directly.

```bash
# Type check
bun run tsc --noEmit

# Run specific script
bun run generator/index.ts --channel=@GitHub --html --output=output.html
```

## Project Structure

- `generator/` - CLI tool for fetching YouTube videos
  - `index.ts` - Main entry point
  - `api.ts` - YouTube API functions
  - `parsers.ts` - Data extraction utilities
  - `html-generator.ts` - HTML page generator
  - `types.ts` - TypeScript type definitions
  - `config.ts` - Configuration
  - `utils.ts` - Utility functions
  - `logger.ts` - Logging utilities
- `website/` - Interactive web server
  - `server.ts` - Bun HTTP server
  - `channel-processor.ts` - Channel fetching for web
  - `public/` - Static frontend files (HTML, CSS, JS)
  - `data/` - Channel storage
- `dist/` - Generated HTML output files

## Code Style

- TypeScript with strict mode enabled
- ESNext target and module system
- Use `.ts` extensions in imports (Bun supports this natively)
- Functional patterns preferred where possible

## Testing

This project does not currently have automated tests. When adding new features, manually verify:

1. CLI tool generates correct HTML output
2. Web server starts and serves channels correctly

```bash
# Example verification commands
bun run start --channel=@GitHub --html --output=dist/test.html
bun run web  # Then visit http://localhost:3000
```

## CLI Usage Examples

```bash
# Tech channels
bun run tech

# Movie trailers
bun run movies

# Podcasts with enrichment
bun run podcasts
```

## Key Bun APIs Used

- `Bun.serve()` - HTTP server
- `Bun.file()` - File operations
- `Bun.write()` - Write files
- Native fetch API for YouTube requests
