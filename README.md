# YouTube Catalog

A .NET 10 application for discovering and viewing the top trending videos from multiple YouTube channels. This solution aggregates videos from your favorite channels, filters by publication date, and sorts by view count.

## Features

- **Multi-Channel Search** - Query multiple YouTube channels simultaneously
- **Customizable Results** - Choose how many videos (top X) and the time period (past Y days)
- **Fast Performance** - Results are cached to provide quick responses for repeated queries
- **Channel Discovery** - Search for channels by name or add them by URL/ID
- **Responsive UI** - Mobile-friendly Blazor Server interface

## Architecture

- **YouTubeCatalog.Api** - ASP.NET Core Web API backend
- **YouTubeCatalog.UI** - Blazor Server frontend
- **YouTubeCatalog.Core** - Shared domain models and interfaces
- **YouTubeCatalog.Tests** - Unit and integration tests

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- Visual Studio 2022, VS Code, or Rider (optional)

## Getting Started

### Clone the Repository

```bash
git clone https://github.com/Meir017/youtube-viewer.git
cd youtube-viewer
```

### Restore Dependencies

```bash
dotnet restore
```

### Build the Solution

```bash
dotnet build
```

### Run the Application

You need to run both the API and UI projects simultaneously. Open two terminal windows:

#### Terminal 1: Run the API

```bash
cd YouTubeCatalog.Api
dotnet run
```

The API will start at `https://localhost:5001` (or the port shown in the terminal).

#### Terminal 2: Run the UI

```bash
cd YouTubeCatalog.UI
dotnet run
```

The UI will start at `https://localhost:5002` (or the port shown in the terminal).

### CLI

A command-line interface (YouTubeCatalog.Cli) is provided to fetch and catalog videos from multiple YouTube channels without starting the UI.

#### Running the CLI

```bash
dotnet run --project YouTubeCatalog.Cli -- --input <file> [--output <file>] [--days <number>]
```

#### Options

- `--input, -i` (required) - Path to input file containing channel IDs or handles, one per line
- `--output, -o` (optional) - Output JSON file path (default: `channels.json`)
- `--days, -d` (optional) - Lookback window in days (default: 3650)

#### Examples

Fetch videos from channels listed in `channels.txt` for the last 30 days:

```bash
dotnet run --project YouTubeCatalog.Cli -- --input channels.txt --output result.json --days 30
```

Using short options:

```bash
dotnet run --project YouTubeCatalog.Cli -- -i channels.txt -o result.json -d 7
```

Show help:

```bash
dotnet run --project YouTubeCatalog.Cli -- --help
```

#### Input File Format

Create a text file with one channel ID or handle per line:

```
UCxxxxxxxxxxxx
@channelhandle
UCyyyyyyyyyyyyyy
```

> **Note**: If the API runs on a different port, update `appsettings.json` in the UI project:
> ```json
> {
>   "ApiBaseUrl": "https://localhost:YOUR_API_PORT"
> }
> ```

### Alternative: Run Both Projects Using `dotnet watch`

For development with hot reload:

**Terminal 1 (API):**
```bash
cd YouTubeCatalog.Api
dotnet watch run
```

**Terminal 2 (UI):**
```bash
cd YouTubeCatalog.UI
dotnet watch run
```

## Usage

1. Navigate to the UI in your browser (typically `https://localhost:5002`)
2. Go to the **Catalog** page
3. Add YouTube channels:
   - Paste channel URLs or IDs (one per line)
   - Or search for channels by name
4. Set parameters:
   - **Top X Videos**: Number of videos to display (1-1000)
   - **Past Y Days**: Time period to filter by (1-365)
5. Click **Fetch Results**
6. Browse the aggregated video results sorted by view count

## Configuration

### API Configuration (`YouTubeCatalog.Api/appsettings.json`)

```json
{
  "BackgroundRefresh": {
    "Enabled": true,
    "IntervalMinutes": 60
  }
}
```

### UI Configuration (`YouTubeCatalog.UI/appsettings.json`)

```json
{
  "ApiBaseUrl": "https://localhost:5001"
}
```

#### Local-file (developer / offline) mode 🔧

You can run the UI entirely from a local JSON bundle (no backend required) — useful for demos or offline development. The feature is gated by `LocalFileMode` and uses the bundled sample by default.

- Bundled sample: `YouTubeCatalog.UI/wwwroot/sample-channels.json`
- Config keys:
  - `LocalFileMode` (bool) — enable local-file mode (development only)
  - `LocalFilePath` (string, optional) — absolute path to a custom channels JSON file

Example `appsettings.Development.json` snippet:

```json
{
  "LocalFileMode": true,
  "LocalFilePath": null
}
```

Run the UI in local-file mode (PowerShell):

```powershell
$env:ASPNETCORE_ENVIRONMENT='Development'
$env:ASPNETCORE_URLS='https://localhost:5002'
dotnet run --project YouTubeCatalog.UI
```

Or override at runtime with command-line args (works with `dotnet run`):

```powershell
dotnet run --project YouTubeCatalog.UI -- --LocalFileMode true --LocalFilePath "C:\path\to\channels.json"
```

Behavior & troubleshooting:

- If the configured file is missing or invalid the UI will fall back to the normal backend flow and emit a clear developer-friendly error in the console/logs. ✅
- Check the bundled sample at `YouTubeCatalog.UI/wwwroot/sample-channels.json` to confirm expected schema.
- To override with a custom file use `LocalFilePath` (absolute path) or pass `--LocalFilePath` on the command line.
- Logs are visible in the terminal started by `dotnet run`; enable `ASPNETCORE_ENVIRONMENT=Development` for more verbose output.

## Testing

Run all tests:

```bash
dotnet test
```

Run tests with coverage:

```bash
dotnet test /p:CollectCoverage=true /p:CoverageReportFormat=opencover
```

## Project Structure

```
youtube-viewer/
├── YouTubeCatalog.Api/          # Backend API
│   ├── Controllers/             # API endpoints
│   ├── Services/                # Business logic
│   └── Program.cs               # API startup
├── YouTubeCatalog.UI/           # Blazor Server UI
│   ├── Pages/                   # Razor pages
│   ├── Shared/                  # Shared components
│   ├── Services/                # API client
│   └── Models/                  # DTOs
├── YouTubeCatalog.Core/         # Shared library
│   └── IYoutubeClient.cs        # YouTube client interface
├── YouTubeCatalog.Tests/        # Tests
├── Directory.Packages.props     # Central package management
└── global.json                  # SDK version lock

```

## API Endpoints

### Catalog

- **POST** `/api/catalog/query` - Query videos across multiple channels
  - Request body:
    ```json
    {
      "channelIds": ["UC...", "UC..."],
      "top": 10,
      "days": 30
    }
    ```

### Health

- **GET** `/health` - API health check

## Development Notes

- Uses **Central Package Management** via `Directory.Packages.props`
- SDK version locked via `global.json` (.NET 10)
- Follows .NET best practices (see `AGENTS.md` for guidelines)
- Implements caching with configurable TTL
- Includes retry/backoff policies via Polly
- Structured logging with Serilog

## Troubleshooting

### API Connection Issues

If the UI cannot connect to the API:

1. Verify the API is running and accessible
2. Check the `ApiBaseUrl` in `YouTubeCatalog.UI/appsettings.json`
3. Ensure no firewall is blocking the connection
4. Check HTTPS certificate is trusted

### YouTube Rate Limiting

If you encounter rate limiting:

1. Reduce the number of channels queried simultaneously
2. Increase cache TTL in API configuration
3. Wait before making additional requests

### Build Issues

If the build fails:

```bash
# Clean and rebuild
dotnet clean
dotnet restore
dotnet build
```

## Contributing

See `tasks.md` for the current implementation status and planned features.

## License

[Add your license here]

## Additional Documentation

- **PRD_Youtube_Catalog.md** - Product requirements document
- **tasks.md** - Implementation tasks and progress
- **AGENTS.md** - .NET best practices for this repository