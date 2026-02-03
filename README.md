# YouTube Viewer

A Node.js CLI tool for fetching and aggregating videos from multiple YouTube channels. Generate HTML pages to browse trending videos from your favorite channels.

## Features

- **Multi-Channel Fetching** - Query multiple YouTube channels simultaneously
- **Flexible Filtering** - Filter by video age, limit results, and set minimum video length
- **Shorts Support** - Optionally include YouTube Shorts
- **Video Enrichment** - Fetch additional metadata like view counts and likes
- **HTML Generation** - Generate static HTML pages for easy viewing
- **Concurrent Fetching** - Parallel channel fetching based on CPU cores

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)

## Getting Started

### Clone the Repository

```bash
git clone https://github.com/Meir017/youtube-viewer.git
cd youtube-viewer
```

### Basic Usage

```bash
node generator/youtube.js --channel=@GitHub --html --output=output.html
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
node generator/youtube.js --channel=@GitHub,@code,@MicrosoftDeveloper --html --output=tech.html --max-age=30 --limit=500
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
node generator/youtube.js --channel=@channelhandle --shorts-limit=50 --html --output=channel.html
```

### Enrich videos with additional metadata

```bash
node generator/youtube.js --channel=@GitHub --enrich --enrich-concurrency=2 --html
```

## Project Structure

```
youtube-viewer/
├── generator/
│   ├── youtube.js          # Main CLI script
│   ├── tech.ps1            # Tech channels preset
│   ├── movies.ps1          # Movies channels preset
│   └── tech-podcasts.ps1   # Tech podcasts preset
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