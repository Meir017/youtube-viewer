using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Memory;
using YouTubeCatalog.Core;
using YouTubeCatalog.Api.Controllers;

namespace YouTubeCatalog.Api.Services
{
    public class CatalogService
    {
        private readonly IYoutubeClient _youtubeClient;
        private readonly IMemoryCache _cache;
        private readonly int _maxDegreeOfParallelism = 4;
        private readonly TimeSpan _perChannelCacheTtl = TimeSpan.FromMinutes(5);

        public CatalogService(YouTubeCatalog.Core.IYoutubeClient youtubeClient, IMemoryCache cache)
        {
            _youtubeClient = youtubeClient;
            _cache = cache;
        }

        public async Task<CatalogQueryResponse> QueryAsync(CatalogQueryRequest request, CancellationToken cancellationToken = default)
        {
            var perChannelStatus = new List<PerChannelStatusDto>();
            var videoSummaries = new List<YouTubeCatalog.Core.VideoSummary>();

            using var semaphore = new SemaphoreSlim(_maxDegreeOfParallelism);

            var tasks = request.ChannelIds.Select(async channelId =>
            {
                await semaphore.WaitAsync(cancellationToken).ConfigureAwait(false);
                try
                {
                    var cutoff = DateTime.UtcNow.AddDays(-request.Days);
                    var cacheKey = $"channel:{channelId}:cutoff:{cutoff:yyyyMMdd}:top:{request.Top}:days:{request.Days}";
                    if (!_cache.TryGetValue(cacheKey, out YouTubeCatalog.Core.VideoSummary[]? cached))
                    {
                        var items = await _youtubeClient.GetTopViewedVideosAsync(channelId, request.Top, request.Days, cancellationToken).ConfigureAwait(false);
                        cached = items?.ToArray() ?? Array.Empty<YouTubeCatalog.Core.VideoSummary>();
                        _cache.Set(cacheKey, cached, _perChannelCacheTtl);
                    }

                    if (cached != null)
                    {
                        videoSummaries.AddRange(cached);
                    }
                    perChannelStatus.Add(new PerChannelStatusDto { ChannelId = channelId, Success = true });
                }
                catch (OperationCanceledException)
                {
                    perChannelStatus.Add(new PerChannelStatusDto { ChannelId = channelId, Success = false, Message = "Canceled" });
                }
                catch (Exception ex)
                {
                    perChannelStatus.Add(new PerChannelStatusDto { ChannelId = channelId, Success = false, Message = ex.Message });
                }
                finally
                {
                    semaphore.Release();
                }
            }).ToArray();

            await Task.WhenAll(tasks).ConfigureAwait(false);

            var videoDtos = videoSummaries
                .OrderByDescending(v => v.Views)
                .Take(request.Top)
                .Select(v => new VideoDto
                {
                    VideoId = v.VideoId,
                    Title = v.Title,
                    ChannelId = v.ChannelId,
                    ChannelTitle = v.ChannelTitle,
                    Views = v.Views,
                    PublishedAt = v.PublishedAt,
                    ThumbnailUrl = v.ThumbnailUrl.ToString()
                }).ToArray();

            return new CatalogQueryResponse
            {
                Videos = videoDtos,
                GeneratedAt = DateTime.UtcNow,
                Partial = perChannelStatus.Any(s => !s.Success),
                PerChannelStatus = perChannelStatus,
                CacheAgeSeconds = 0
            };
        }
    }
}