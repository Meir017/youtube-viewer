using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using YouTubeCatalog.Core;

namespace YouTubeCatalog.Api.Services
{
    public class BackgroundRefreshWorker : BackgroundService
    {
        private readonly IYoutubeClient _youtubeClient;
        private readonly IMemoryCache _cache;
        private readonly BackgroundRefreshOptions _options;
        private readonly ILogger<BackgroundRefreshWorker> _logger;

        public BackgroundRefreshWorker(IYoutubeClient youtubeClient, IMemoryCache cache, BackgroundRefreshOptions options, ILogger<BackgroundRefreshWorker> logger)
        {
            _youtubeClient = youtubeClient;
            _cache = cache;
            _options = options;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            if (!_options.Enabled)
                return;

            var interval = TimeSpan.FromSeconds(Math.Max(1, _options.IntervalSeconds));

            while (!stoppingToken.IsCancellationRequested)
            {
                foreach (var channel in _options.PopularChannels ?? Array.Empty<string>())
                {
                    try
                    {
                        var cutoff = DateTime.UtcNow.AddDays(-_options.Days);
                        var cacheKey = $"channel:{channel}:cutoff:{cutoff:yyyyMMdd}:top:{_options.Top}:days:{_options.Days}";
                        if (!_cache.TryGetValue(cacheKey, out _))
                        {
                            var items = await _youtubeClient.GetTopViewedVideosAsync(channel, _options.Top, _options.Days, stoppingToken).ConfigureAwait(false);
                            var cached = items?.ToArray() ?? Array.Empty<YouTubeCatalog.Core.VideoSummary>();
                            _cache.Set(cacheKey, cached, TimeSpan.FromMinutes(_options.CacheTtlMinutes));
                        }
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        // shutting down
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error refreshing channel {Channel}", channel);
                    }
                }

                try
                {
                    await Task.Delay(interval, stoppingToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    // exit loop
                }
            }
        }
    }
}