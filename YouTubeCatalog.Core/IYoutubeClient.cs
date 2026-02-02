using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Humanizer;

namespace YouTubeCatalog.Core
{
    public record VideoSummary(string VideoId, string Title, string ChannelId, string ChannelTitle, long Views, DateTime PublishedAt, Uri ThumbnailUrl)
    {
        public string HumanizedViews => Views.ToWords();
        public string HumanizedPublishedAt => PublishedAt.Humanize();
    }

    public interface IYoutubeClient
    {
        Task<IReadOnlyList<VideoSummary>> GetTopViewedVideosAsync(string channelId, int top, int days, CancellationToken cancellationToken = default);
    }
}