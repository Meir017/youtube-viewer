using System.Threading;
using System.Threading.Tasks;
using YouTubeCatalog.UI.Models;

namespace YouTubeCatalog.UI.Services
{
    public interface ILocalCatalogProvider
    {
        /// <summary>
        /// Returns the list of channels available from the configured local source.
        /// </summary>
        Task<LocalChannelDto[]> GetChannelsAsync(CancellationToken cancellationToken = default);
    }
}