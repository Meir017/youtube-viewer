# YouTube Viewer

[![Tests](https://github.com/meir017/youtube-viewer/actions/workflows/test.yml/badge.svg)](https://github.com/meir017/youtube-viewer/actions/workflows/test.yml)

A Bun/TypeScript CLI tool for fetching and aggregating videos from multiple YouTube channels. Generate HTML pages to browse trending videos from your favorite channels.

## Features

- **Multi-Channel Fetching** - Query multiple YouTube channels simultaneously
- **Flexible Filtering** - Filter by video age, limit results, and set minimum video length
- **Shorts Support** - Optionally include YouTube Shorts
- **Video Enrichment** - Fetch additional metadata like view counts and likes
- **HTML Generation** - Generate static HTML pages for easy viewing
- **Concurrent Fetching** - Parallel channel fetching based on CPU cores

## Prerequisites

- [Bun](https://bun.sh/) (v1.0 or later)

## Getting Started

### Clone the Repository

```bash
git clone https://github.com/Meir017/youtube-viewer.git
cd youtube-viewer
```

### Install Dependencies

```bash
bun install
```

### Basic Usage

```bash
bun run generator/youtube.ts --channel=@GitHub --html --output=output.html
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--channel=<id>` | Channel ID or handle (can be comma-separated or repeated) | `UCYp3rk70ACGXQ4gFAiMr1SQ` |
| `--format=<type>` | Output format: `html`, `json`, or `console` | `console` |
| `--html` | Generate HTML output (shorthand for `--format=html`) | false |
| `--output=<file>` | Output file path | `channel.html` or `channels.json` |
| `--limit=<n>` | Maximum videos per channel | 150 |
| `--max-age=<days>` | Maximum video age in days | Infinity |
| `--shorts-limit=<n>` | Maximum shorts to fetch (0 = disabled) | 0 |
| `--min-length=<sec>` | Minimum video length in seconds | 0 |
| `--enrich` | Fetch additional video metadata | false |
| `--enrich-concurrency=<n>` | Concurrent enrichment requests | 1 |
| `--enrich-delay=<ms>` | Delay between enrichment requests | 2000 |

## Examples

### Fetch videos from multiple tech channels

```bash
bun run generator/youtube.ts --channel=@GitHub,@code,@MicrosoftDeveloper --html --output=tech.html --max-age=30 --limit=500
```

### Generate JSON for the website

```bash
bun run generator/youtube.ts --channel=@GitHub,@Fireship --format=json --output=website/data/channels.json
```

### Using PowerShell scripts

Pre-configured scripts are available in the `generator/` directory:

```powershell
# Tech channels
.\generator\tech.ps1

# Movies channels
.\generator\movies.ps1

# Tech podcasts
.\generator\tech-podcasts.ps1
```

### Fetch from a single channel with shorts

```bash
bun run generator/youtube.ts --channel=@channelhandle --shorts-limit=50 --html --output=channel.html
```

### Enrich videos with additional metadata

```bash
bun run generator/youtube.ts --channel=@GitHub --enrich --enrich-concurrency=2 --html
```

## Interactive Website

In addition to the CLI, you can run an interactive website to add and browse YouTube channels.

### Start the Web Server

```bash
bun run web
```

Then open http://localhost:3000 in your browser.

### Website Features

- **Add channels** by entering their handle (e.g., `@GitHub`)
- **Browse videos** in a grid layout with thumbnails
- **Refresh channel data** to get the latest videos
- **Remove channels** you no longer want to follow
- **Persistent storage** - your channels are saved between sessions

## Website Tools

Offline CLI tools for managing the website database (`website/data/channels.json`).

### Enrich Videos

Enriches un-enriched videos with publish dates and descriptions by fetching metadata from YouTube.

```bash
# Run enrichment on all collections
bun run tools:enrich

# Preview what would be enriched (no changes)
bun run tools:enrich -- --dry-run

# Enrich a specific collection with a limit
bun run tools:enrich -- --collection=default-collection --limit=100

# Adjust concurrency and delay for rate limiting
bun run tools:enrich -- --concurrency=3 --delay=3000
```

| Option | Description | Default |
|--------|-------------|---------|
| `--collection=<id>` | Only enrich a specific collection | all |
| `--concurrency=<n>` | Number of concurrent requests | 5 |
| `--delay=<ms>` | Delay between requests in ms | 2000 |
| `--dry-run` | Show what would be enriched without changes | false |
| `--limit=<n>` | Max videos to enrich per run | unlimited |

### Refresh Channels

Refreshes all channels in the website database, fetching new videos and merging with existing data.

```bash
# Refresh all collections
bun run tools:refresh

# Preview what would be refreshed (no changes)
bun run tools:refresh -- --dry-run

# Refresh a specific collection
bun run tools:refresh -- --collection=<id>
```

| Option | Description | Default |
|--------|-------------|---------|
| `--collection=<id>` | Only refresh a specific collection | all |
| `--dry-run` | Show what would be refreshed without changes | false |

### Build Static Site

Generates a self-contained static website that can be deployed to any static host (GitHub Pages, Netlify, S3, etc.) without a backend server.

```bash
# Build static site (default output: dist/static/)
bun run tools:build-static

# Build to a custom output directory
bun run tools:build-static -- --output=my-site
```

| Option | Description | Default |
|--------|-------------|---------|
| `--output=<dir>` | Output directory | `dist/static` |

**How to generate and deploy a static site:**

1. Set up collections and channels via `bun run web` (the interactive server)
2. Optionally enrich videos with `bun run tools:enrich`
3. Build the static site: `bun run tools:build-static`
4. Deploy the `dist/static/` directory to any static host

The static site is read-only — it displays the video data as a snapshot without any backend API.

## Project Structure

```
youtube-viewer/
├── generator/
│   ├── index.ts            # Main CLI script (TypeScript)
│   ├── api.ts              # YouTube API functions
│   ├── parsers.ts          # Data extraction utilities
│   ├── html-generator.ts   # HTML page generator
│   └── ...                 # Other generator modules
├── website/
│   ├── server.ts           # Bun HTTP server
│   ├── channel-processor.ts # Channel fetching for web
│   ├── public/             # Static frontend files
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── app.js
│   └── data/               # Channel storage
├── website-tools/
│   ├── enrich.ts           # Offline video enrichment tool
│   ├── refresh.ts          # Offline channel refresh tool
│   └── build-static.ts     # Static site build tool
├── static-website/
│   ├── index.html          # Static site HTML (read-only)
│   ├── app.js              # Static site JavaScript (no backend)
│   └── styles.css          # Static site styles
├── package.json            # Bun project configuration
├── tsconfig.json           # TypeScript configuration
├── LICENSE
└── README.md
```

## Output

The tool generates an HTML file with:
- Channel information and thumbnails
- Video cards with titles, thumbnails, and metadata
- View counts and publication dates
- Direct links to YouTube videos

## License

MIT