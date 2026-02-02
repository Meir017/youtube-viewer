using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace YouTubeCatalog.Api.Controllers
{
    [ApiController]
    [Route("api/admin")]
    public class AdminController : ControllerBase
    {
        private readonly IMemoryCache _cache;
        private readonly YouTubeCatalog.Api.BackgroundRefreshOptions _options;

        public AdminController(IMemoryCache cache, YouTubeCatalog.Api.BackgroundRefreshOptions options)
        {
            _cache = cache;
            _options = options;
        }

        [HttpGet("background-refresh")]
        public IActionResult GetBackgroundRefreshStatus()
        {
            return Ok(_options);
        }

        [HttpGet("background-refresh/cache-status")]
        public IActionResult GetCacheStatus()
        {
            var cutoff = DateTime.UtcNow.AddDays(-30);
            var list = new List<object>();
            foreach (var channel in _options.PopularChannels ?? Array.Empty<string>())
            {
                var key = $"channel:{channel}:cutoff:{cutoff:yyyyMMdd}";
                var exists = _cache.TryGetValue(key, out _);
                list.Add(new { Channel = channel, Cached = exists });
            }
            return Ok(list);
        }

        [HttpPost("background-refresh/toggle")]
        public IActionResult ToggleBackgroundRefresh([FromBody] ToggleRequest req)
        {
            _options.Enabled = req.Enabled;
            return Ok(new { Enabled = _options.Enabled });
        }

        public class ToggleRequest { public bool Enabled { get; set; } }
    }
}
