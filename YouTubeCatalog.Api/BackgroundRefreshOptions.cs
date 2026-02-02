using System;

namespace YouTubeCatalog.Api
{
    public class BackgroundRefreshOptions
    {
        public bool Enabled { get; set; } = false;
        public int IntervalSeconds { get; set; } = 300;
        public string[] PopularChannels { get; set; } = Array.Empty<string>();
        public int CacheTtlMinutes { get; set; } = 5;
        public int Top { get; set; } = 10;
        public int Days { get; set; } = 30;
    }
}