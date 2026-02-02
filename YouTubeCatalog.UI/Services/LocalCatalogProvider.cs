using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using YouTubeCatalog.UI.Models;

namespace YouTubeCatalog.UI.Services
{
    internal class LocalFileOptions
    {
        public bool LocalFileMode { get; set; }
        public string? LocalFilePath { get; set; }
    }

    public class LocalCatalogProvider : ILocalCatalogProvider
    {
        private readonly IWebHostEnvironment _env;
        private readonly IConfiguration _config;
        private readonly ILogger<LocalCatalogProvider> _logger;
        private readonly string _defaultRelative = "wwwroot/sample-channels.json";

        public LocalCatalogProvider(IWebHostEnvironment env, IConfiguration config, ILogger<LocalCatalogProvider> logger)
        {
            _env = env ?? throw new ArgumentNullException(nameof(env));
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<LocalChannelDto[]> GetChannelsAsync(CancellationToken cancellationToken = default)
        {
            var configured = _config["LocalFilePath"]; // optional absolute path
            string path;

            if (!string.IsNullOrEmpty(configured) && Path.IsPathRooted(configured))
            {
                path = configured;
            }
            else
            {
                // default to webroot static file
                path = Path.Combine(_env.ContentRootPath, _defaultRelative.Replace('/', Path.DirectorySeparatorChar));
            }

            _logger.LogInformation("Loading local channels from {Path}", path);

            if (!File.Exists(path))
            {
                var msg = $"Local channels file not found at: {path}";
                _logger.LogWarning(msg);
                throw new FileNotFoundException(msg, path);
            }

            try
            {
                await using var fs = File.OpenRead(path);
                using var doc = await JsonDocument.ParseAsync(fs, cancellationToken: cancellationToken).ConfigureAwait(false);
                if (doc.RootElement.ValueKind != JsonValueKind.Array)
                {
                    throw new InvalidDataException("Local channels JSON must be an array");
                }

                var list = new List<LocalChannelDto>();
                foreach (var item in doc.RootElement.EnumerateArray())
                {
                    // Support two local formats:
                    //  - app format: { "channelId": "UC..", "title": "...", "thumbnailUrl": "..." }
                    //  - CLI export:  { "channel": "@ChannelHandle", "videos": [ { "Thumbnail": "..." }, ... ] }

                    string? channelId = null;
                    string? title = null;

                    // primary: explicit channelId/title (app format)
                    if (item.TryGetProperty("channelId", out var cid) && cid.ValueKind == JsonValueKind.String)
                        channelId = cid.GetString();

                    if (item.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String)
                        title = t.GetString();

                    // fallback: CLI-style export (detect by presence of `channel` and `videos`)
                    if (channelId is null && item.TryGetProperty("channel", out var cliChannel) && cliChannel.ValueKind == JsonValueKind.String)
                    {
                        channelId = cliChannel.GetString();

                        // if title not supplied, derive a friendly title from the handle
                        if (string.IsNullOrWhiteSpace(title))
                        {
                            var raw = channelId ?? string.Empty;
                            title = raw.StartsWith("@") ? raw[1..] : raw;
                        }

                        // try to extract a thumbnail from the first video entry (common in CLI export)
                        if (item.TryGetProperty("videos", out var videos) && videos.ValueKind == JsonValueKind.Array && videos.GetArrayLength() > 0)
                        {
                            var first = videos[0];
                            // check common properties used in the CLI JSON (case-insensitive checks)
                            if (first.ValueKind == JsonValueKind.Object)
                            {
                                string? thumb = null;
                                if (first.TryGetProperty("thumbnailUrl", out var tv) && tv.ValueKind == JsonValueKind.String)
                                    thumb = tv.GetString();
                                else if (first.TryGetProperty("Thumbnail", out var tV2) && tV2.ValueKind == JsonValueKind.String)
                                    thumb = tV2.GetString();
                                else if (first.TryGetProperty("thumbnail", out var tV3) && tV3.ValueKind == JsonValueKind.String)
                                    thumb = tV3.GetString();

                                if (!string.IsNullOrWhiteSpace(thumb) && Uri.IsWellFormedUriString(thumb, UriKind.Absolute))
                                    title = title ?? channelId; // ensure title present; thumbnail handled below
                                if (!string.IsNullOrWhiteSpace(thumb) && Uri.IsWellFormedUriString(thumb, UriKind.Absolute))
                                {
                                    // we'll set dto.ThumbnailUrl later when constructing dto
                                }
                            }
                        }
                    }

                    // at this point we should have at least a channelId
                    if (string.IsNullOrWhiteSpace(channelId))
                        throw new InvalidDataException("Each channel must contain a non-empty 'channelId' (or be a CLI-style object with 'channel' + 'videos'). See docs for supported local formats.");

                    // ensure we have a title (fallback to channelId)
                    if (string.IsNullOrWhiteSpace(title))
                        title = channelId;

                    var dto = new LocalChannelDto
                    {
                        ChannelId = channelId!,
                        Title = title!,
                    };

                    // thumbnail: prefer explicit thumbnailUrl, then CLI video's Thumbnail
                    if (item.TryGetProperty("thumbnailUrl", out var thumbExplicit) && thumbExplicit.ValueKind == JsonValueKind.String)
                    {
                        var s = thumbExplicit.GetString();
                        if (Uri.IsWellFormedUriString(s, UriKind.Absolute))
                            dto.ThumbnailUrl = s;
                    }
                    else if (item.TryGetProperty("videos", out var videos) && videos.ValueKind == JsonValueKind.Array && videos.GetArrayLength() > 0)
                    {
                        var first = videos[0];
                        if (first.ValueKind == JsonValueKind.Object)
                        {
                            if (first.TryGetProperty("thumbnailUrl", out var tv) && tv.ValueKind == JsonValueKind.String)
                            {
                                var s = tv.GetString();
                                if (Uri.IsWellFormedUriString(s, UriKind.Absolute)) dto.ThumbnailUrl = s;
                            }
                            else if (first.TryGetProperty("Thumbnail", out var tV2) && tV2.ValueKind == JsonValueKind.String)
                            {
                                var s = tV2.GetString();
                                if (Uri.IsWellFormedUriString(s, UriKind.Absolute)) dto.ThumbnailUrl = s;
                            }
                            else if (first.TryGetProperty("thumbnail", out var tV3) && tV3.ValueKind == JsonValueKind.String)
                            {
                                var s = tV3.GetString();
                                if (Uri.IsWellFormedUriString(s, UriKind.Absolute)) dto.ThumbnailUrl = s;
                            }
                        }
                    }

                    if (item.TryGetProperty("description", out var desc) && desc.ValueKind == JsonValueKind.String)
                        dto.Description = desc.GetString();

                    if (item.TryGetProperty("videos", out var vArr) && vArr.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var v in vArr.EnumerateArray())
                        {
                            var video = new VideoDto
                            {
                                ChannelId = dto.ChannelId,
                                ChannelTitle = dto.Title
                            };

                            if (v.TryGetProperty("VideoId", out var vid) || v.TryGetProperty("videoId", out vid))
                                video.VideoId = vid.GetString() ?? string.Empty;

                            if (v.TryGetProperty("Title", out var vTitle) || v.TryGetProperty("title", out vTitle))
                                video.Title = vTitle.GetString() ?? string.Empty;

                            if (v.TryGetProperty("Views", out var vViews) || v.TryGetProperty("views", out vViews))
                                video.Views = vViews.ValueKind == JsonValueKind.Number ? vViews.GetInt64() : 0;

                            if (v.TryGetProperty("PublishedAt", out var vPub) || v.TryGetProperty("publishedAt", out vPub))
                            {
                                if (DateTime.TryParse(vPub.GetString(), out var pubDate))
                                    video.PublishedAt = pubDate;
                            }

                            if (v.TryGetProperty("Thumbnail", out var vThumb) || v.TryGetProperty("thumbnailUrl", out vThumb) || v.TryGetProperty("thumbnail", out vThumb))
                                video.ThumbnailUrl = vThumb.GetString();

                            if (!string.IsNullOrEmpty(video.VideoId))
                                dto.Videos.Add(video);
                        }
                    }

                    if (item.TryGetProperty("lastUpdated", out var lu) && lu.ValueKind == JsonValueKind.String)
                    {
                        if (DateTimeOffset.TryParse(lu.GetString(), out var parsed))
                            dto.LastUpdated = parsed;
                    }

                    list.Add(dto);
                }

                return list.ToArray();
            }
            catch (Exception ex) when (ex is JsonException || ex is InvalidDataException)
            {
                _logger.LogWarning(ex, "Failed to parse local channels file");
                throw;
            }
        }
    }
}