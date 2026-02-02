using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using YouTubeCatalog.UI.Models;

namespace YouTubeCatalog.UI.Services
{
    /// <summary>
    /// HTTP client service for communicating with the YouTube Catalog API
    /// </summary>
    public class CatalogApiClient
    {
        private readonly HttpClient _httpClient;
        private readonly TimeSpan _timeout = TimeSpan.FromSeconds(30);

        public CatalogApiClient(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }

        /// <summary>
        /// Queries the catalog API for videos across multiple channels
        /// </summary>
        public async Task<CatalogQueryResponse> QueryCatalogAsync(
            IEnumerable<string> channelIds,
            int top,
            int days,
            CancellationToken cancellationToken = default)
        {
            var request = new CatalogQueryRequest
            {
                ChannelIds = channelIds.ToArray(),
                Top = top,
                Days = days
            };

            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                cts.CancelAfter(_timeout);

                var response = await _httpClient.PostAsJsonAsync(
                    "api/catalog/query",
                    request,
                    cancellationToken: cts.Token);

                response.EnsureSuccessStatusCode();

                var result = await response.Content.ReadFromJsonAsync<CatalogQueryResponse>(cancellationToken: cts.Token);
                return result ?? throw new InvalidOperationException("Empty response from API");
            }
            catch (HttpRequestException ex)
            {
                throw new ApiException($"Failed to query catalog: {ex.Message}", ex);
            }
            catch (OperationCanceledException ex)
            {
                throw new ApiException($"Request timeout after {_timeout.TotalSeconds} seconds", ex);
            }
            catch (Exception ex)
            {
                throw new ApiException($"Unexpected error querying catalog: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Searches for channels by name
        /// </summary>
        public async Task<List<ChannelSearchResultDto>> SearchChannelsAsync(
            string query,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(query) || query.Length < 2)
                return new List<ChannelSearchResultDto>();

            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                cts.CancelAfter(TimeSpan.FromSeconds(10));

                var encodedQuery = Uri.EscapeDataString(query);
                var response = await _httpClient.GetAsync(
                    $"api/channels/search?q={encodedQuery}",
                    HttpCompletionOption.ResponseContentRead,
                    cts.Token);

                response.EnsureSuccessStatusCode();

                var results = await response.Content.ReadFromJsonAsync<List<ChannelSearchResultDto>>(cancellationToken: cts.Token);
                return results ?? new List<ChannelSearchResultDto>();
            }
            catch (Exception ex)
            {
                // Log but don't throw - search is optional
                Console.WriteLine($"Channel search failed: {ex.Message}");
                return new List<ChannelSearchResultDto>();
            }
        }

        /// <summary>
        /// Gets health status of the API
        /// </summary>
        public async Task<bool> IsApiHealthyAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                var response = await _httpClient.GetAsync(
                    "health",
                    HttpCompletionOption.ResponseHeadersRead,
                    cancellationToken);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }
    }

    /// <summary>
    /// Exception thrown by API client
    /// </summary>
    public class ApiException : Exception
    {
        public ApiException(string message) : base(message) { }
        public ApiException(string message, Exception innerException) : base(message, innerException) { }
    }
}
