using System;

namespace YouTubeCatalog.UI.Models
{
    public class LocalChannelDto
    {
        public string ChannelId { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? ThumbnailUrl { get; set; }
        public DateTimeOffset? LastUpdated { get; set; }
        public System.Collections.Generic.List<VideoDto> Videos { get; set; } = new();
    }
}