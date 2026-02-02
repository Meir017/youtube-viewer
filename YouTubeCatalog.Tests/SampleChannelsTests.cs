using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Xunit;

namespace YouTubeCatalog.Tests
{
    public class SampleChannelsTests
    {
        [Fact]
        public void SampleChannelsJson_IsPresent_AndMatchesSchema()
        {
            // Locate sample file from test output directory (try a few relative locations)
            var candidates = new[] {
                Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "YouTubeCatalog.UI", "wwwroot", "sample-channels.json"),
                Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "YouTubeCatalog.UI", "wwwroot", "sample-channels.json"),
                Path.Combine(Directory.GetCurrentDirectory(), "..", "YouTubeCatalog.UI", "wwwroot", "sample-channels.json")
            };

            var samplePath = candidates.FirstOrDefault(File.Exists);
            Assert.False(string.IsNullOrEmpty(samplePath),
                $"sample-channels.json not found. Tried: {string.Join("; ", candidates)}");

            var json = File.ReadAllText(samplePath);
            using var doc = JsonDocument.Parse(json);
            Assert.Equal(JsonValueKind.Array, doc.RootElement.ValueKind);
            Assert.True(doc.RootElement.GetArrayLength() > 0, "sample-channels.json must contain at least one channel");

            foreach (var item in doc.RootElement.EnumerateArray())
            {
                Assert.True(item.TryGetProperty("channelId", out var cid) && cid.GetString()?.Length > 0,
                    "Each channel must have a non-empty 'channelId'");

                Assert.True(item.TryGetProperty("title", out var title) && title.GetString()?.Length > 0,
                    "Each channel must have a non-empty 'title'");

                if (item.TryGetProperty("lastUpdated", out var lastUpdated) && lastUpdated.ValueKind == JsonValueKind.String)
                {
                    Assert.True(DateTimeOffset.TryParse(lastUpdated.GetString(), out _),
                        "If present, 'lastUpdated' must be a valid date-time string");
                }

                if (item.TryGetProperty("thumbnailUrl", out var thumb) && thumb.ValueKind == JsonValueKind.String)
                {
                    var s = thumb.GetString();
                    Assert.True(Uri.IsWellFormedUriString(s, UriKind.Absolute), "thumbnailUrl must be a valid absolute URI if present");
                }
            }
        }
    }
}
