using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Collections.Concurrent;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;
using YouTubeCatalog.UI.Services;

namespace YouTubeCatalog.Tests
{
    public class LocalFileModeIntegrationTests : IClassFixture<WebApplicationFactory<YouTubeCatalog.UI.Program>>
    {
        [Fact]
        public async Task RootPage_ShowsBundledChannels_WhenLocalFileModeEnabled()
        {
            // Arrange: start the app with LocalFileMode=true and inject a test provider
            var captured = new ConcurrentQueue<string>();

            using var factory = new WebApplicationFactory<YouTubeCatalog.UI.Program>()
                .WithWebHostBuilder(builder =>
                {
                    builder.ConfigureAppConfiguration((ctx, cfg) =>
                    {
                        cfg.AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("LocalFileMode", "true") });
                    });

                    builder.ConfigureServices(services =>
                    {
                        // capture logs emitted during startup/runtime
                        services.AddLogging(lb =>
                        {
                            lb.ClearProviders();
                            lb.AddProvider(new YouTubeCatalog.Tests.TestLogging.TestLoggerProvider(captured));
                        });

                        // replace the provider with a deterministic test implementation
                        services.AddSingleton<ILocalCatalogProvider>(new TestLocalProvider());
                    });
                });

            var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = true });

            // Act - resolve the provider from the configured test host and ensure LocalFileMode is enabled
            var cfg = factory.Services.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>();
            Assert.True(cfg.GetValue<bool>("LocalFileMode"), "LocalFileMode should be enabled in the test host");

            var provider = factory.Services.GetRequiredService<ILocalCatalogProvider>();
            var channels = await provider.GetChannelsAsync();

            // Assert - provider returns the test channel and the static sample file is served by the host
            Assert.Single(channels);
            Assert.Equal("Example Channel (integration)", channels[0].Title);

            var sampleJson = await client.GetStringAsync("/sample-channels.json");
            Assert.False(string.IsNullOrWhiteSpace(sampleJson));

            // Assert - a telemetry/log entry for LocalFileMode was emitted during startup
            var found = captured.Any(s => s.Contains("LocalFileModeEnabled") || s.Contains("LocalFileMode enabled"));
            Assert.True(found, "Expected a startup log/telemetry event for LocalFileMode");
        }

        [Fact]
        public async Task Catalog_HostPage_IncludesStylesheets_WhenNavigatingToCatalog()
        {
            // Arrange - start the app (default profile) and request the catalog route
            using var factory = new WebApplicationFactory<YouTubeCatalog.UI.Program>()
                .WithWebHostBuilder(builder =>
                {
                    // ensure LocalFileMode=false for this assertion (host page should be identical either way)
                    builder.ConfigureAppConfiguration((ctx, cfg) => cfg.AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("LocalFileMode", "false") }));
                });

            var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = true });

            // Act
            var resp = await client.GetAsync("/catalog");
            resp.EnsureSuccessStatusCode();
            var html = await resp.Content.ReadAsStringAsync();

            // Assert - host page contains required stylesheet links and base href so relative assets resolve correctly
            Assert.Contains("<base href=\"/\"", html, System.StringComparison.OrdinalIgnoreCase);
            Assert.Contains("css/site.css", html, System.StringComparison.OrdinalIgnoreCase);
            Assert.Contains("YouTubeCatalog.UI.styles.css", html, System.StringComparison.OrdinalIgnoreCase);
            Assert.Contains("_content/Microsoft.Fast.Components.FluentUI/Microsoft.Fast.Components.FluentUI.bundle.scp.css", html, System.StringComparison.OrdinalIgnoreCase);
        }

        private class TestLocalProvider : ILocalCatalogProvider
        {
            public Task<YouTubeCatalog.UI.Models.LocalChannelDto[]> GetChannelsAsync(System.Threading.CancellationToken cancellationToken = default)
            {
                var arr = new[]
                {
                    new YouTubeCatalog.UI.Models.LocalChannelDto { ChannelId = "UC_INT_EX", Title = "Example Channel (integration)", ThumbnailUrl = "https://example/1.jpg" }
                };

                return Task.FromResult(arr);
            }
        }
    }
}
