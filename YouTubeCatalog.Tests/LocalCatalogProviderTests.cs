using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Xunit;
using YouTubeCatalog.UI.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace YouTubeCatalog.Tests
{
    public class LocalCatalogProviderTests
    {
        [Fact]
        public async Task GetChannelsAsync_ParsesValidFile()
        {
            var tmp = Path.GetTempFileName();
            await File.WriteAllTextAsync(tmp, "[ { \"channelId\": \"UC123\", \"title\": \"T\" } ]");

            var inMemory = new ConfigurationBuilder().AddInMemoryCollection(new[] { new KeyValuePair<string,string?>("LocalFilePath", tmp) }).Build();
            var env = new TestWebHostEnv(Path.GetDirectoryName(tmp)!);
            var logger = NullLogger<LocalCatalogProvider>.Instance;
            var provider = new LocalCatalogProvider(env, inMemory, logger);

            var channels = await provider.GetChannelsAsync();
            Assert.Single(channels);
            Assert.Equal("UC123", channels[0].ChannelId);
        }

        [Fact]
        public async Task GetChannelsAsync_ParsesCliFormatAndExtractsThumbnail()
        {
            var tmp = Path.GetTempFileName();
            var cli = "[ { \"channel\": \"@FOO\", \"videos\": [ { \"Thumbnail\": \"https://example.com/t.jpg\" } ] } ]";
            await File.WriteAllTextAsync(tmp, cli);

            var inMemory = new ConfigurationBuilder().AddInMemoryCollection(new[] { new KeyValuePair<string,string?>("LocalFilePath", tmp) }).Build();
            var env = new TestWebHostEnv(Path.GetDirectoryName(tmp)!);
            var provider = new LocalCatalogProvider(env, inMemory, NullLogger<LocalCatalogProvider>.Instance);

            var channels = await provider.GetChannelsAsync();
            Assert.Single(channels);
            Assert.Equal("@FOO", channels[0].ChannelId);
            Assert.Equal("FOO", channels[0].Title); // derived from handle
            Assert.Equal("https://example.com/t.jpg", channels[0].ThumbnailUrl);
        }

        [Fact]
        public void GetChannelsAsync_Throws_WhenFileMissing()
        {
            var inMemory = new ConfigurationBuilder().AddInMemoryCollection().Build();
            var env = new TestWebHostEnv(Path.GetTempPath());
            var logger = NullLogger<LocalCatalogProvider>.Instance;
            var provider = new LocalCatalogProvider(env, inMemory, logger);

            Assert.ThrowsAsync<FileNotFoundException>(() => provider.GetChannelsAsync());
        }

        [Fact]
        public async System.Threading.Tasks.Task GetChannelsAsync_ParsePerformance_SyntheticLargeFile()
        {
            // This is a lightweight, opt-in perf benchmark. By default it only asserts correctness.
            int n = 1000;
            var arr = System.Linq.Enumerable.Range(0, n).Select(i => new { channelId = $"UC{i:D6}", title = $"Channel {i}" });
            var json = JsonSerializer.Serialize(arr);
            var tmp = Path.GetTempFileName();
            await File.WriteAllTextAsync(tmp, json);

            var inMemory = new ConfigurationBuilder().AddInMemoryCollection(new[] { new KeyValuePair<string,string?>("LocalFilePath", tmp) }).Build();
            var env = new TestWebHostEnv(Path.GetDirectoryName(tmp)!);
            var provider = new LocalCatalogProvider(env, inMemory, NullLogger<LocalCatalogProvider>.Instance);

            var sw = System.Diagnostics.Stopwatch.StartNew();
            var channels = await provider.GetChannelsAsync();
            sw.Stop();

            Assert.Equal(n, channels.Length);

            // If RUN_PERF is set we also assert a conservative threshold to catch regressions locally
            if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("RUN_PERF")))
            {
                // conservative: 2s for 1000 items on CI/dev machines
                Assert.InRange(sw.ElapsedMilliseconds, 0, 2000);
            }
        }

        private class TestWebHostEnv : IWebHostEnvironment
        {
            public TestWebHostEnv(string contentRoot)
            {
                ContentRootPath = contentRoot;
            }

            public string EnvironmentName { get; set; } = "Test";
            public string ApplicationName { get; set; } = "TestApp";
            public string ContentRootPath { get; set; }
            public Microsoft.Extensions.FileProviders.IFileProvider? ContentRootFileProvider { get; set; }
            public string? WebRootPath { get; set; }
            public Microsoft.Extensions.FileProviders.IFileProvider? WebRootFileProvider { get; set; }
        }
    }
}