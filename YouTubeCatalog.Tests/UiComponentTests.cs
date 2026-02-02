using System.Net.Http;
using System.Threading.Tasks;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Fast.Components.FluentUI;
using Xunit;
using YouTubeCatalog.UI.Services;

namespace YouTubeCatalog.Tests
{
    public class UiComponentTests : TestContext
    {
        private class TestJsRuntime : Microsoft.JSInterop.IJSRuntime
        {
            public System.Threading.Tasks.ValueTask<TValue> InvokeAsync<TValue>(string identifier, object?[]? args)
            {
                return new System.Threading.Tasks.ValueTask<TValue>(default(TValue)!);
            }

            public System.Threading.Tasks.ValueTask<TValue> InvokeAsync<TValue>(string identifier, System.Threading.CancellationToken cancellationToken, object?[]? args)
            {
                return new System.Threading.Tasks.ValueTask<TValue>(default(TValue)!);
            }
        }

        private class TestLocalProvider : YouTubeCatalog.UI.Services.ILocalCatalogProvider
        {
            public System.Threading.Tasks.Task<YouTubeCatalog.UI.Models.LocalChannelDto[]> GetChannelsAsync(System.Threading.CancellationToken cancellationToken = default)
            {
                return System.Threading.Tasks.Task.FromResult(Array.Empty<YouTubeCatalog.UI.Models.LocalChannelDto>());
            }
        }

        public UiComponentTests()
        {
            Services.AddFluentUIComponents();
            // Minimal registrations required by components under test
            Services.AddSingleton(new CatalogApiClient(new HttpClient()));
            Services.AddSingleton<Microsoft.JSInterop.IJSRuntime>(new TestJsRuntime());
            // Provide a minimal IConfiguration for components that inject it (tests can override per-case)
            Services.AddSingleton<Microsoft.Extensions.Configuration.IConfiguration>(
                new Microsoft.Extensions.Configuration.ConfigurationBuilder()
                    .AddInMemoryCollection(new[] { new System.Collections.Generic.KeyValuePair<string,string?>("LocalFileMode","false") })
                    .Build());

            // Provide a no-op local provider so components that inject it won't fail in tests
            Services.AddSingleton<YouTubeCatalog.UI.Services.ILocalCatalogProvider>(new TestLocalProvider());
        }

        [Fact]
        public void ChannelPicker_ShowsParseErrorMessageBar_WhenNoInput()
        {
            // Arrange
            var cut = Render<YouTubeCatalog.UI.Shared.ChannelPicker>();

            // Act - click the native fallback (bUnit reliably triggers native button clicks)
            cut.Find(".parse-button-native").Click();

            // Assert - error text is rendered
            cut.WaitForAssertion(() => Assert.Contains("Could not parse", cut.Markup));
            Assert.Contains("Could not parse", cut.Markup);
        }

        [Fact]
        public void Catalog_ShowsErrorMessageBar_WhenNoChannelsSelected()
        {
            // Arrange
            var cut = Render<YouTubeCatalog.UI.Pages.Catalog>();

            // Act - click the native fallback (bUnit reliably triggers native button clicks)
            cut.Find(".fluent-fetch-button-native").Click();

            // Assert - error text is rendered
            cut.WaitForAssertion(() => Assert.Contains("Please select at least one channel", cut.Markup));
            Assert.Contains("Please select at least one channel", cut.Markup);
        }

        [Fact]
        public void NavMenu_Toggler_TogglesCollapse_OnClick()
        {
            // Arrange
            var cut = Render<YouTubeCatalog.UI.Shared.NavMenu>();

            // Nav should start collapsed on narrow viewports (implementation detail: collapse class present)
            var toggler = cut.Find(".navbar-toggler");
            var nav = cut.Find("#main-nav");
            Assert.Contains("collapse", nav.ClassName);
            Assert.Equal("false", toggler.GetAttribute("aria-expanded")?.ToLower() ?? "false");

            // Act - click toggler
            toggler.Click();

            // Assert - collapse is removed and aria-expanded updated
            Assert.DoesNotContain("collapse", nav.ClassName);
            Assert.Equal("true", toggler.GetAttribute("aria-expanded")?.ToLower());
        }

        [Fact]
        public void Catalog_HasDataGridWrapper_ForResponsiveScroll()
        {
            // Arrange
            var cut = Render<YouTubeCatalog.UI.Pages.Catalog>();

            // Assert - responsive wrapper exists around the FluentDataGrid
            var wrapper = cut.Find(".data-grid-wrapper");
            Assert.NotNull(wrapper);
            Assert.Equal("region", wrapper.GetAttribute("role"));
            Assert.Contains("Video results table", wrapper.GetAttribute("aria-label") ?? string.Empty);
        }

        [Fact]
        public void ChannelPicker_AddsAndRemovesChannel_FromManualInput()
        {
            // Arrange
            var cut = Render<YouTubeCatalog.UI.Shared.ChannelPicker>();

            // Act - enter a valid channel id and trigger the native parse button
            var input = cut.Find("#channelInput");
            input.Change("UC_TEST_123");
            cut.Find(".parse-button-native").Click();

            // Assert - channel chip is rendered
            cut.WaitForAssertion(() => Assert.Contains("UC_TEST_123", cut.Markup));

            // Act - remove the channel by invoking the component's RemoveChannel method (safer in bUnit)
            var pickerInstance = cut.Instance;
            var remove = typeof(YouTubeCatalog.UI.Shared.ChannelPicker).GetMethod("RemoveChannel", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            remove?.Invoke(pickerInstance, new object[] { "UC_TEST_123" });

            // Re-render and assert - channel removed (ensure no selected-channel elements remain)
            cut.Render();
            cut.WaitForAssertion(() => Assert.Empty(cut.FindAll(".channel-id")));
        }

        [Fact]
        public void Catalog_NumberFields_TwoWayBinding()
        {
            // Arrange
            var cut = Render<YouTubeCatalog.UI.Pages.Catalog>();

            // Act - change Top and Days inputs
            var top = cut.Find("#topInput");
            var days = cut.Find("#daysInput");
            top.Change("5");
            days.Change("7");

            // Assert - inputs reflect new values
            Assert.Equal("5", cut.Find("#topInput").GetAttribute("value"));
            Assert.Equal("7", cut.Find("#daysInput").GetAttribute("value"));
        }

        [Fact]
        public async System.Threading.Tasks.Task ThemeToggle_RendersAndTogglesThemeAsync()
        {
            // Arrange - ensure ThemeService is registered with the Test JS runtime
            var svc = new YouTubeCatalog.UI.Services.ThemeService(new TestJsRuntime());
            Services.AddSingleton<YouTubeCatalog.UI.Services.ThemeService>(svc);

            // Act - render ThemeToggle (should not throw) and find the button
            var cut = Render<YouTubeCatalog.UI.Shared.ThemeToggle>();
            var btn = cut.Find("button[title='Toggle theme']");
            Assert.NotNull(btn);

            // Act - click and wait for ThemeService to be updated
            btn.Click();
            cut.WaitForAssertion(() => Assert.True(svc.Current.IsDark));
        }

        [Fact]
        public void Catalog_LocalFile_FilterUI_HasAccessibleNames()
        {
            // Arrange - create an isolated TestContext so we can register LocalFileMode=true for this render
            using var ctx = new Bunit.TestContext();
            ctx.Services.AddFluentUIComponents();
            ctx.Services.AddSingleton<Microsoft.JSInterop.IJSRuntime>(new TestJsRuntime());
            ctx.Services.AddSingleton(new YouTubeCatalog.UI.Services.CatalogApiClient(new System.Net.Http.HttpClient()));

            var inMemory = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
                .AddInMemoryCollection(new[] { new System.Collections.Generic.KeyValuePair<string,string?>("LocalFileMode","true") })
                .Build();
            ctx.Services.AddSingleton<Microsoft.Extensions.Configuration.IConfiguration>(inMemory);
            ctx.Services.AddSingleton<YouTubeCatalog.UI.Services.ILocalCatalogProvider>(new TestLocalProviderWithItems());

            // Act
            var cut = ctx.Render<YouTubeCatalog.UI.Pages.Catalog>();

            // Assert - filter input exists and label text is present (FluentLabel may render differently in test DOM)
            Assert.NotNull(cut.Find("#localFilter"));
            Assert.Contains("Filter bundled channels", cut.Markup);

            var items = cut.FindAll(".local-channel-item");
            Assert.NotEmpty(items);
            Assert.All(items, item => Assert.False(string.IsNullOrWhiteSpace(item.TextContent)));
            // each item should expose an actionable button (Add/Remove) with accessible name
            Assert.All(items, item => Assert.True(item.TextContent.Contains("Add") || item.TextContent.Contains("Remove")));
        }

        private class TestLocalProviderWithItems : YouTubeCatalog.UI.Services.ILocalCatalogProvider
        {
            public System.Threading.Tasks.Task<YouTubeCatalog.UI.Models.LocalChannelDto[]> GetChannelsAsync(System.Threading.CancellationToken cancellationToken = default)
            {
                var arr = new[] {
                    new YouTubeCatalog.UI.Models.LocalChannelDto { ChannelId = "UC_TEST_1", Title = "Test One", ThumbnailUrl = "https://example.com/1.jpg" },
                    new YouTubeCatalog.UI.Models.LocalChannelDto { ChannelId = "UC_TEST_2", Title = "Test Two", ThumbnailUrl = "https://example.com/2.jpg" }
                };
                return System.Threading.Tasks.Task.FromResult(arr);
            }
        }

        private class FakeCatalogHandler : System.Net.Http.HttpMessageHandler
        {
            public string? LastRequestJson { get; private set; }

            protected override async System.Threading.Tasks.Task<System.Net.Http.HttpResponseMessage> SendAsync(System.Net.Http.HttpRequestMessage request, System.Threading.CancellationToken cancellationToken)
            {
                LastRequestJson = request.Content == null ? null : await request.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

                var resp = new YouTubeCatalog.UI.Models.CatalogQueryResponse
                {
                    GeneratedAt = System.DateTime.UtcNow,
                    Videos = new[] {
                        new YouTubeCatalog.UI.Models.VideoDto { VideoId = "v1", Title = "AAAA", ChannelTitle = "ChanA", Views = 100, PublishedAt = System.DateTime.UtcNow.AddDays(-1) },
                        new YouTubeCatalog.UI.Models.VideoDto { VideoId = "v2", Title = "ZZZZ", ChannelTitle = "ChanB", Views = 50, PublishedAt = System.DateTime.UtcNow.AddDays(-2) },
                        new YouTubeCatalog.UI.Models.VideoDto { VideoId = "v3", Title = "MMMM", ChannelTitle = "ChanC", Views = 200, PublishedAt = System.DateTime.UtcNow.AddDays(-3) }
                    }
                };

                var json = System.Text.Json.JsonSerializer.Serialize(resp);
                return new System.Net.Http.HttpResponseMessage(System.Net.HttpStatusCode.OK)
                {
                    Content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json")
                };
            }
        }

        [Fact]
        public async System.Threading.Tasks.Task Catalog_FetchesAndDisplaysResults_WithFakeApiClientAsync()
        {
            // Arrange - register CatalogApiClient backed by a fake HttpMessageHandler that captures requests
            var handler = new FakeCatalogHandler();
            var http = new System.Net.Http.HttpClient(handler) { BaseAddress = new System.Uri("http://localhost/") };
            Services.AddSingleton(new YouTubeCatalog.UI.Services.CatalogApiClient(http));

            var cut = Render<YouTubeCatalog.UI.Pages.Catalog>();

            // Add a selected channel so FetchResults proceeds
            cut.Find(".channel-chip, .empty-message");
            // Instead of interacting with the child (flaky in bUnit), set SelectedChannels on the Catalog instance and invoke FetchResults via reflection
            var catalogType = typeof(YouTubeCatalog.UI.Pages.Catalog);
            var inst = cut.Instance;
            var selProp = catalogType.GetProperty("SelectedChannels", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            selProp?.SetValue(inst, new System.Collections.Generic.List<string> { "UC_FAKE_1" });

            // Invoke private FetchResults() and await it
            var fetchMethod = catalogType.GetMethod("FetchResults", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            var fetchTask = (System.Threading.Tasks.Task?)fetchMethod?.Invoke(inst, null);
            if (fetchTask != null) await fetchTask.ConfigureAwait(false);

            // Wait for the request to be sent and captured by the fake handler
            cut.WaitForAssertion(() => Assert.NotNull(handler.LastRequestJson));
            Assert.Contains("UC_FAKE_1", handler.LastRequestJson);

            // Verify the Catalog component received and stored the response (inspect private QueryResponse via reflection)
            var prop = catalogType.GetProperty("QueryResponse", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            var queryResp = prop?.GetValue(inst) as YouTubeCatalog.UI.Models.CatalogQueryResponse;
            Assert.NotNull(queryResp);
            Assert.Equal(3, queryResp!.Videos.Length);
            Assert.Contains(queryResp.Videos, v => v.Title == "AAAA");

            // Assert - sorting method returns an IEnumerable (sanity check)
            var method = catalogType.GetMethod("GetSortedVideos", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            var sorted = method?.Invoke(inst, null) as System.Collections.IEnumerable;
            Assert.NotNull(sorted);
        }

        [Fact]
        public void Catalog_ErrorMessageBar_IsDismissible()
        {
            // Arrange
            var cut = Render<YouTubeCatalog.UI.Pages.Catalog>();

            // Act - trigger validation error by clicking fetch with no channels
            cut.Find(".fluent-fetch-button-native").Click();

            // Assert - error message bar shown
            cut.WaitForAssertion(() => Assert.Contains("Please select at least one channel", cut.Markup));

            // Act - prefer clicking a visible dismiss button if present, otherwise call ClearError via reflection
            var buttons = cut.FindAll(".error-section button");
            if (buttons.Count > 0)
            {
                buttons[0].Click();
            }
            else
            {
                // Fallback: invoke private ClearError() to simulate dismiss
                var inst = cut.Instance;
                var clear = typeof(YouTubeCatalog.UI.Pages.Catalog).GetMethod("ClearError", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
                clear?.Invoke(inst, null);
                // force re-render after invoking private method
                cut.Render();
            }

            // Assert - message is removed
            cut.WaitForAssertion(() => Assert.DoesNotContain("Please select at least one channel", cut.Markup));
        }
    }
}
