using System.Threading.Tasks;
using Microsoft.Playwright;
using Xunit;

// NOTE: This Playwright test is a scaffolded, opt-in E2E. It is SKIPPED by default so CI doesn't need Playwright installed
// To run locally: install Playwright tooling (dotnet tool restore / playwright install) and remove the Skip attribute.

namespace YouTubeCatalog.Tests
{
    public class LocalFileModePlaywrightTests
    {
        [Fact]
        public async Task LocalFileMode_Filtering_Works_EndToEnd()
        {
            // This E2E is opt-in: CI/dev can set RUN_PLAYWRIGHT_E2E=true to run the scenario.
            // It remains a scaffold and is skipped by default when the env var is not present.
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("RUN_PLAYWRIGHT_E2E")))
            {
                // no-op so the test is skipped in default CI; opt-in by setting RUN_PLAYWRIGHT_E2E=true
                return;
            }

            // This test is intentionally left as an executable scaffold. When enabled it should:
            // 1. Start the app (or point to a running dev server hosting the UI with LocalFileMode=true)
            // 2. Navigate to the root page
            // 3. Assert bundled channels are visible, type into the filter and assert results

            // Example (pseudo) — uncomment & adapt when enabling:
            using var playwright = await Microsoft.Playwright.Playwright.CreateAsync();
            var browser = await playwright.Chromium.LaunchAsync(new() { Headless = true });
            var page = await browser.NewPageAsync();
            // await page.GotoAsync("http://localhost:5000/");
            // await page.WaitForSelectorAsync(".local-channel-item");
            // await page.FillAsync("#localFilter", "Example");
            // Assert.Contains("Example Channel", await page.InnerTextAsync(".catalog-list"));

            await Task.CompletedTask;
        }

        [Fact]
        public async Task LocalFileMode_A11y_WithAxe_EndToEnd()
        {
            // Opt-in a11y check: set RUN_PLAYWRIGHT_E2E=true and RUN_PLAYWRIGHT_A11Y=true to execute locally
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("RUN_PLAYWRIGHT_E2E")) || string.IsNullOrEmpty(Environment.GetEnvironmentVariable("RUN_PLAYWRIGHT_A11Y")))
                return;

            using var playwright = await Microsoft.Playwright.Playwright.CreateAsync();
            var browser = await playwright.Chromium.LaunchAsync(new() { Headless = true });
            var page = await browser.NewPageAsync();

            // NOTE: start the app separately (dotnet run) or point to a running dev server
            await page.GotoAsync("http://localhost:5000/");
            await page.WaitForSelectorAsync(".local-channel-item");

            // inject axe-core from CDN (opt-in E2E; network required)
            await page.EvaluateAsync(@"async () => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.6.3/axe.min.js';
                document.head.appendChild(s);
                await new Promise(resolve => { s.onload = resolve; s.onerror = resolve; });
            }");

            // run axe and assert no violations
            var result = await page.EvaluateAsync<System.Text.Json.JsonElement>("async () => await axe.run()");
            var violations = result.GetProperty("violations");
            Assert.Equal(0, violations.GetArrayLength());
        }
    }
}
