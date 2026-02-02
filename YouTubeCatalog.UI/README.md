# YouTubeCatalog.UI — developer notes

Purpose: quick developer guide for running the Blazor UI in either
- static/local-file (offline/demo) mode, or
- connected mode using the live backend (YouTubeCatalog.Api).

---

## Quick matrix
- ✅ Local (bundled sample): `LocalFileMode = true` (default for Development)
- ✅ Local (custom file): `LocalFileMode = true` + `LocalFilePath` (absolute)

Note: the UI accepts two local-file schemas — the app schema (`channelId`, `title`, `thumbnailUrl`) and the CLI export schema (`channel`, `videos`). When a CLI export is provided the provider will derive the channel title from the handle and attempt to use the first video's `Thumbnail` (or `thumbnailUrl`) as the channel thumbnail.
- ✅ Live backend: `LocalFileMode = false` (or unset) and set `ApiBaseUrl` to the running API

---

## Run the UI with the bundled sample (fastest — demo/offline) ✅
- Behavior: UI reads `wwwroot/sample-channels.json` and does not call the backend.
- Good for demos, accessibility/perf checks and offline development.

PowerShell (recommended for dev on Windows):
```powershell
# development mode (uses bundled sample from wwwroot)
$env:ASPNETCORE_ENVIRONMENT = 'Development'
cd YouTubeCatalog.UI
dotnet run
```

Cross‑platform (bash):
```bash
ASPNETCORE_ENVIRONMENT=Development dotnet run --project YouTubeCatalog.UI
```

How it works: `LocalFileMode` is enabled in `appsettings.Development.json` by default; the app logs a startup message when local-file mode is active.

---

## Run the UI with a custom local channels file ✅
- Use when you want to preview a specific channels JSON without changing the bundled sample.

PowerShell example:
```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
cd YouTubeCatalog.UI
dotnet run -- --LocalFileMode true --LocalFilePath "C:\path\to\my-channels.json"
```

Notes:
- `LocalFilePath` should be an absolute path. The app validates the schema (see `YouTubeCatalog.Tests/SampleChannelsTests.cs`).
- If the file is missing or invalid, the UI will fall back to the backend and emit a warning in the logs.

---

## Run the UI against the live backend (connected mode) ✅
- Behavior: UI uses the `CatalogApiClient` (server-side HttpClient) to call the API.
- Use this to exercise real data, background refresh, or end-to-end API behavior.

1) Start the API (example ports shown):

PowerShell:
```powershell
cd YouTubeCatalog.Api
# uses launchSettings by default; optionally override the URL
dotnet run
# OR explicit URL:
# dotnet run --urls "http://localhost:5042"
```

2) Start the UI and point it at the running API:

PowerShell (set via env var):
```powershell
$env:ApiBaseUrl = 'http://localhost:5042'    # or https://localhost:5001
dotnet run --project YouTubeCatalog.UI
```

Or pass as a command-line config value:
```powershell
dotnet run --project YouTubeCatalog.UI -- --ApiBaseUrl "http://localhost:5042"
```

Quick verification:
- UI startup logs will show whether `LocalFileMode` is enabled and (if enabled) the source: "LocalFileMode enabled; source=..." ✅
- If API is running, the catalog should load in the UI within a few seconds.
- You can directly POST a test query to the API:
  - curl:
    ```bash
    curl -sS -X POST http://localhost:5042/api/catalog/query \
      -H "Content-Type: application/json" \
      -d '{"ChannelIds":["<channelId>"],"Top":5,"Days":30}' | jq
    ```
  - PowerShell:
    ```powershell
    Invoke-RestMethod -Method POST -Uri http://localhost:5042/api/catalog/query -ContentType 'application/json' -Body '{"ChannelIds":["<id>"],"Top":5,"Days":30}'
    ```

Implementation notes:
- The UI reads `ApiBaseUrl` from configuration (env / appsettings / CLI); default fallback in code is `https://localhost:5001`.
- The UI is Server-side Blazor and issues API requests from the server process (CORS is not required for same-machine dev flows).

---

## Configuration reference (dev)
- Local-file mode:
  - `LocalFileMode` (bool) — enables offline/demo provider
  - `LocalFilePath` (string, optional) — absolute path to a channels JSON file
- API connection:
  - `ApiBaseUrl` (string) — base address for the Catalog API (e.g. `http://localhost:5042`)

Defaults & locations:
- `YouTubeCatalog.UI/appsettings.Development.json` enables `LocalFileMode` for developer convenience.
- `YouTubeCatalog.UI/appsettings.json` contains the shipped default `ApiBaseUrl`.

---

## Troubleshooting & tips ⚠️
- UI still calls the backend when you expected a local file:
  - Confirm `LocalFileMode=true` in `appsettings.Development.json` or pass `--LocalFileMode true` on the command line.
  - Check the startup log for: `LocalFileMode enabled; source=...` (shows bundled vs. provided path).
- "Sample file not found": the app logs a warning and falls back to the API — confirm path and JSON schema.
- API errors / slow catalog responses: check `YouTubeCatalog.Api` logs and retry the `POST /api/catalog/query` example above.
- Running both services quickly: open two terminals — start the API first, then the UI.

---

## Testing notes
- bUnit + integration tests cover LocalFileMode flows (see `YouTubeCatalog.Tests`).
- Playwright E2E (opt-in) covers accessibility and end-to-end local-file scenarios; opt-in via `RUN_PLAYWRIGHT_E2E` / `RUN_PLAYWRIGHT_A11Y` (see tests for examples).

---

## Where to put custom samples
- Recommended: set `LocalFilePath` to an absolute path.
- Alternative (quick demo): replace `YouTubeCatalog.UI/wwwroot/sample-channels.json` — the static file will be served by the app.

---

## More info
- Schema expectations and example data: see `YouTubeCatalog.Tests/SampleChannelsTests.cs`.
- If you want a reproducible demo script, say which platform (Windows/macOS/Linux) and I will add a ready-to-run PowerShell/bash snippet.
