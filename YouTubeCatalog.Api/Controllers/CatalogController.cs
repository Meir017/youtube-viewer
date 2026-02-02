using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace YouTubeCatalog.Api.Controllers
{
    [ApiController]
    [Route("api/catalog")]
    public class CatalogController : ControllerBase
    {
        private readonly YouTubeCatalog.Api.Services.CatalogService _catalogService;

        public CatalogController(YouTubeCatalog.Api.Services.CatalogService catalogService)
        {
            _catalogService = catalogService;
        }

        [HttpPost("query")]
        public async Task<IActionResult> Query([FromBody] CatalogQueryRequest request, CancellationToken cancellationToken)
        {
            if (request.Top <= 0 || request.Top > 1000)
                return BadRequest("Top must be between 1 and 1000.");
            if (request.Days <= 0 || request.Days > 365 * 3)
                return BadRequest("Days must be between 1 and 1095.");

            var response = await _catalogService.QueryAsync(request, cancellationToken).ConfigureAwait(false);
            return Ok(response);
        }
    }

    public class CatalogQueryRequest
    {
        public string[] ChannelIds { get; set; } = [];
        public int Top { get; set; } = 10;
        public int Days { get; set; } = 30;
    }

    public class CatalogQueryResponse
    {
        public VideoDto[] Videos { get; set; } = [];
        public DateTime GeneratedAt { get; set; }
        public bool Partial { get; set; }
        public List<PerChannelStatusDto> PerChannelStatus { get; set; } = [];
        public int CacheAgeSeconds { get; set; }
    }

    public class VideoDto
    {
        public string VideoId { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string ChannelId { get; set; } = string.Empty;
        public string ChannelTitle { get; set; } = string.Empty;
        public long Views { get; set; }
        public DateTime PublishedAt { get; set; }
        public string ThumbnailUrl { get; set; } = string.Empty;
        public string Url => $"https://www.youtube.com/watch?v={VideoId}";
    }

    public class PerChannelStatusDto
    {
        public string ChannelId { get; set; } = string.Empty;
        public bool Success { get; set; }
        public string? Message { get; set; }
    }
}
