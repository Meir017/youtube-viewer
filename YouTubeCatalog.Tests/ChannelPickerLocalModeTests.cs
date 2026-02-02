using System.Linq;
using Bunit;
using Xunit;
using YouTubeCatalog.UI.Shared;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using System.Collections.Generic;

namespace YouTubeCatalog.Tests
{
    public class ChannelPickerLocalModeTests : TestContext
    {
        private class TestLocalProvider : YouTubeCatalog.UI.Services.ILocalCatalogProvider
        {
            public System.Threading.Tasks.Task<YouTubeCatalog.UI.Models.LocalChannelDto[]> GetChannelsAsync(System.Threading.CancellationToken cancellationToken = default)
            {
                var arr = new[] {
                    new YouTubeCatalog.UI.Models.LocalChannelDto { ChannelId = "UC_EXAMPLE", Title = "Example Channel", ThumbnailUrl = "https://example/1.jpg" },
                    new YouTubeCatalog.UI.Models.LocalChannelDto { ChannelId = "UC_OTHER", Title = "Other Channel", ThumbnailUrl = "https://example/2.jpg" }
                };
                return System.Threading.Tasks.Task.FromResult(arr);
            }
        }

        [Fact]
        public void ChannelPicker_ShowsBundledChannels_WhenLocalModeEnabled()
        {
            // Arrange
            Services.AddSingleton<IConfiguration>(new ConfigurationBuilder().AddInMemoryCollection(new[] { new KeyValuePair<string,string?>("LocalFileMode","true") }).Build());
            Services.AddSingleton<YouTubeCatalog.UI.Services.ILocalCatalogProvider>(new TestLocalProvider());

            var cut = Render<ChannelPicker>();

            // Act - wait for render
            var cards = cut.FindAll(".local-channel-item");

            // Assert
            Assert.True(cards.Count > 0, "Expected bundled channels to be rendered in local-file mode");
            Assert.Contains("Example Channel", cards[0].TextContent);
        }
    }
}