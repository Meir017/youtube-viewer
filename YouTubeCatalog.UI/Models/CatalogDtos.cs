using System;
using System.Collections.Generic;

namespace YouTubeCatalog.UI.Models
{
    /// <summary>
    /// Request DTO for catalog query
    /// </summary>
    public class CatalogQueryRequest
    {
        public string[] ChannelIds { get; set; } = Array.Empty<string>();
        public int Top { get; set; } = 10;
        public int Days { get; set; } = 30;
    }

    /// <summary>
    /// Response DTO for catalog query
    /// </summary>
    public class CatalogQueryResponse
    {
        public VideoDto[] Videos { get; set; } = Array.Empty<VideoDto>();
        public DateTime GeneratedAt { get; set; }
        public bool Partial { get; set; }
        public List<PerChannelStatusDto> PerChannelStatus { get; set; } = new();
        public int CacheAgeSeconds { get; set; }
    }

    /// <summary>
    /// DTO for a video result
    /// </summary>
    public class VideoDto
    {
        public string VideoId { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string ChannelId { get; set; } = string.Empty;
        public string ChannelTitle { get; set; } = string.Empty;
        public long Views { get; set; }
        public DateTime PublishedAt { get; set; }
        public string? ThumbnailUrl { get; set; }
        public string? Description { get; set; }
    }

    /// <summary>
    /// DTO for per-channel status in the response
    /// </summary>
    public class PerChannelStatusDto
    {
        public string ChannelId { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty; // "success", "error", "timeout", etc.
        public string? Message { get; set; }
        public int VideosRetrieved { get; set; }
    }

    /// <summary>
    /// Search channel result
    /// </summary>
    public class ChannelSearchResultDto
    {
        public string ChannelId { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string? ThumbnailUrl { get; set; }
    }
}
