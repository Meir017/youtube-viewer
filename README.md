# YouTube Viewer

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
| `--html` | Generate HTML output | false |
| `--output=<file>` | Output file path | `channel.html` |
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