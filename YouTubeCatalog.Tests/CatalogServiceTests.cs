using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Memory;
using Xunit;
using YouTubeCatalog.Api.Services;
using YouTubeCatalog.Core;
using System.Collections.Generic;

namespace YouTubeCatalog.Tests
{
    public class CatalogServiceTests
    {
        [Fact]
        public async Task QueryAsync_ReturnsTopVideos_AcrossChannels()
        {
            // Arrange
            var memCache = new MemoryCache(new MemoryCacheOptions());

            var fakeClient = new FakeYoutubeClient();
            var service = new CatalogService(fakeClient, memCache);

            var request = new YouTubeCatalog.Api.Controllers.CatalogQueryRequest
            {
                ChannelIds = new[] { "chanA", "chanB" },
                Top = 3,
                Days = 30
            };

            // Act
            var resp = await service.QueryAsync(request, CancellationToken.None).ConfigureAwait(false);

            // Assert
            Assert.NotNull(resp);
            Assert.False(resp.Videos.Length == 0);
            // Ensure returned videos are ordered by Views descending
            var views = resp.Videos.Select(v => v.Views).ToArray();
            var sorted = views.OrderByDescending(v => v).ToArray();
            Assert.Equal(sorted, views);
            Assert.True(resp.Videos.Length <= request.Top);
        }

        private class FakeYoutubeClient : IYoutubeClient
        {
            public Task<IReadOnlyList<VideoSummary>> GetTopViewedVideosAsync(string channelId, int top, int days, CancellationToken cancellationToken = default)
            {
                var now = DateTime.UtcNow;
                if (channelId == "chanA")
                {
                    return Task.FromResult<IReadOnlyList<VideoSummary>>(new[] {
                        new VideoSummary("v1","Video 1","chanA","Channel A", 500, now.AddDays(-5), new Uri("https://example.com/1.jpg")),
                        new VideoSummary("v2","Video 2","chanA","Channel A", 150, now.AddDays(-2), new Uri("https://example.com/2.jpg"))
                    });
                }
                else
                {
                    return Task.FromResult<IReadOnlyList<VideoSummary>>(new[] {
                        new VideoSummary("v3","Video 3","chanB","Channel B", 1000, now.AddDays(-1), new Uri("https://example.com/3.jpg")),
                        new VideoSummary("v4","Video 4","chanB","Channel B", 50, now.AddDays(-10), new Uri("https://example.com/4.jpg"))
                    });
                }
            }
        }
    }
}
