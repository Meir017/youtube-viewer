using System;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Bunit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using YouTubeCatalog.UI.Models;
using YouTubeCatalog.UI.Services;

namespace YouTubeCatalog.Tests
{
    public class CatalogLocalModeTests : TestContext
    {
        private class FakeCatalogHandler : HttpMessageHandler
        {
            public string? LastRequestJson { get; private set; }

            protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            {
                LastRequestJson = request.Content == null ? null : await request.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                // Return a 200 with empty results (handler should NOT be invoked in local mode tests)
                var resp = new YouTubeCatalog.UI.Models.CatalogQueryResponse
                {
                    GeneratedAt = DateTime.UtcNow,
                    Videos = Array.Empty<YouTubeCatalog.UI.Models.VideoDto>()
                };

                var json = System.Text.Json.JsonSerializer.Serialize(resp);
                return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
                {
                    Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
                };
            }
        }

        private class TestLocalProvider : ILocalCatalogProvider
        {
            public Task<LocalChannelDto[]> GetChannelsAsync(CancellationToken cancellationToken = default)
            {
                var arr = new[]
                {
                    new LocalChannelDto { ChannelId = "UC_EXAMPLE", Title = "Example Channel", ThumbnailUrl = "https://example/1.jpg" },
                    new LocalChannelDto { ChannelId = "UC_OTHER", Title = "Other Channel", ThumbnailUrl = "https://example/2.jpg" }
                };

                return Task.FromResult(arr);
            }
        }

        [Fact]
        public void Catalog_HidesChannelPicker_And_DoesNotCallBackend_InLocalMode()
        {
            // Arrange - enable local-file mode
            Services.AddSingleton<IConfiguration>(new ConfigurationBuilder().AddInMemoryCollection(new[] { new System.Collections.Generic.KeyValuePair<string,string?>("LocalFileMode","true") }).Build());

            // Register a local provider that returns two bundled channels
            Services.AddSingleton<ILocalCatalogProvider>(new TestLocalProvider());

            // Register a fake CatalogApiClient (backed by a handler that would capture calls)
            var handler = new FakeCatalogHandler();
            var http = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
            Services.AddSingleton(new YouTubeCatalog.UI.Services.CatalogApiClient(http));

            // Act - render Catalog
            var cut = Render<YouTubeCatalog.UI.Pages.Catalog>();

            // Assert - ChannelPicker (full selector) is not rendered in Catalog when using local-file mode
            Assert.Empty(cut.FindAll(".channel-picker"));
            Assert.Contains("Local-file mode", cut.Markup);

            // Wait for bundled channels to be populated and displayed
            cut.WaitForAssertion(() => Assert.True(cut.FindAll(".local-channel-item").Count > 0));

            // Filter the bundled channels
            var filter = cut.Find("#localFilter");
            filter.Change("Example");
            cut.WaitForAssertion(() => Assert.Contains("Example Channel", cut.Markup));

            // Click FetchResults - should NOT call the backend (handler.LastRequestJson stays null)
            cut.Find(".fluent-fetch-button-native").Click();
            Assert.Null(handler.LastRequestJson);

            // UI should show the empty-results state (HasQueried set)
            cut.WaitForAssertion(() => Assert.Contains("No videos found", cut.Markup));
        }
    }
}
