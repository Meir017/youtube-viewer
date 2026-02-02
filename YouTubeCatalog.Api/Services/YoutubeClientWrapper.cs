using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using YouTubeCatalog.Core;
using YoutubeExplode;
using YoutubeExplode.Common;

namespace YouTubeCatalog.Api.Services
{
    using System.Diagnostics;
    using System.Linq;
    using Microsoft.Extensions.Caching.Memory;
    using YoutubeExplode.Channels;

    public class YoutubeClientWrapper(ILogger<YoutubeClientWrapper> logger, IMemoryCache cache) : IYoutubeClient
    {
        private readonly YoutubeClient _youtubeClient = new YoutubeClient();
        private const int MaxMetadataConcurrency = 6;
        private static readonly TimeSpan VideoMetadataCacheTtl = TimeSpan.FromHours(1);

        public async Task<IReadOnlyList<VideoSummary>> GetTopViewedVideosAsync(string channelId, int top, int days, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(channelId) || top <= 0 || days <= 0)
                return Array.Empty<VideoSummary>();

            var cutoff = DateTime.UtcNow.AddDays(-days);
            var results = new ConcurrentBag<VideoSummary>();
            using var semaphore = new SemaphoreSlim(MaxMetadataConcurrency);
            var tasks = new List<Task<VideoSummary?>>();
            var shouldStop = false;

            // Resolve channel handle to channel ID if needed
            string resolvedChannelId;
            if (channelId.StartsWith('@'))
            {
                var channel = await _youtubeClient.Channels.GetByHandleAsync(new ChannelHandle(channelId.Substring(1)), cancellationToken);
                resolvedChannelId = channel.Id;
                logger.LogInformation("Resolved channel handle {Handle} to channel ID {ChannelId}", channelId, resolvedChannelId);
            }
            else
            {
                resolvedChannelId = channelId;
            }

            var overallStartTime = Stopwatch.GetTimestamp();

            var videoCounter = 0;
            await foreach (var upload in _youtubeClient.Channels.GetUploadsAsync(resolvedChannelId).WithCancellation(cancellationToken))
            {
                if (shouldStop || string.IsNullOrWhiteSpace(upload.Id))
                    break;

                // Check if any completed task hit the cutoff
                var completedTasks = tasks.Where(t => t.IsCompleted).ToArray();
                if (completedTasks.Length > 0)
                {
                    foreach (var completedTask in completedTasks)
                    {
                        var result = await completedTask.ConfigureAwait(false);
                        if (result != null)
                        {
                            results.Add(result);
                        }
                        else
                        {
                            shouldStop = true;
                        }
                    }
                    tasks.RemoveAll(t => t.IsCompleted);
                    
                    if (shouldStop)
                    {
                        logger.LogInformation("Hit date cutoff, stopping enumeration after queueing {Count} videos", results.Count);
                        break;
                    }
                }

                await semaphore.WaitAsync(cancellationToken).ConfigureAwait(false);

                var videoId = upload.Id;
                var task = Task.Run(async () =>
                {
                    try
                    {
                        var cacheKey = $"video:{videoId}";
                        if (cache.TryGetValue(cacheKey, out VideoSummary? cachedVideo) && cachedVideo != null)
                        {
                            logger.LogInformation("Using cached metadata for video {VideoId}", videoId);
                            
                            if (cachedVideo.PublishedAt < cutoff)
                            {
                                logger.LogInformation("Cached video {VideoId} is before cutoff {Cutoff:yyyy-MM-dd}", 
                                    videoId, cutoff);
                                return null; // Signal to stop
                            }
                            
                            return cachedVideo;
                        }

                        var startTime = Stopwatch.GetTimestamp();
                        var video = await _youtubeClient.Videos.GetAsync(videoId, cancellationToken).ConfigureAwait(false);
                        var duration = Stopwatch.GetElapsedTime(startTime);
                        
                        var publishedAt = video.UploadDate.UtcDateTime;
                        
                        logger.LogInformation("[{VideoCounter}] Fetched metadata for video {VideoId} (published {PublishedAt:yyyy-MM-dd}) in {Duration} ms", 
                            videoCounter, videoId, publishedAt, duration.TotalMilliseconds);

                        if (publishedAt < cutoff)
                        {
                            logger.LogInformation("Video {VideoId} is before cutoff {Cutoff:yyyy-MM-dd}", 
                                videoId, cutoff);
                            return null; // Signal to stop
                        }

                        var thumbnail = video.Thumbnails.GetWithHighestResolution();
                        var thumbnailUri = Uri.TryCreate(thumbnail.Url, UriKind.Absolute, out var t) ? t : new Uri("about:blank");

                        var videoSummary = new VideoSummary(
                            video.Id,
                            video.Title,
                            video.Author.ChannelId,
                            video.Author.ChannelTitle,
                            (long)video.Engagement.ViewCount,
                            publishedAt,
                            thumbnailUri);

                        cache.Set(cacheKey, videoSummary, VideoMetadataCacheTtl);
                        
                        Interlocked.Increment(ref videoCounter);

                        return videoSummary;
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning(ex, "Failed to fetch metadata for video {VideoId}", videoId);
                        return null;
                    }
                    finally
                    {
                        semaphore.Release();
                    }
                }, cancellationToken);

                tasks.Add(task);
            }

            // Wait for remaining in-flight tasks and collect results
            if (tasks.Count > 0)
            {
                await Task.WhenAll(tasks).ConfigureAwait(false);
                foreach (var task in tasks)
                {
                    var result = await task.ConfigureAwait(false);
                    if (result != null)
                    {
                        results.Add(result);
                    }
                }
            }

            var overallDuration = Stopwatch.GetElapsedTime(overallStartTime);
            logger.LogInformation("Fetched {Count} videos within date range for channel {ChannelId} in {Duration} ms", 
                results.Count, channelId, overallDuration.TotalMilliseconds);

            return results
                .OrderByDescending(v => v.Views)
                .Take(top)
                .ToArray();
        }
    }
}