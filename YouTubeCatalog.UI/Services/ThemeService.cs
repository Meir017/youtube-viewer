using System.Text.Json;
using Microsoft.JSInterop;

namespace YouTubeCatalog.UI.Services
{
    public record ThemeOptions(string Primary, string Secondary, string Surface, string Text, double BaseFontScale, bool IsDark);

    public class ThemeService
    {
        private readonly IJSRuntime _js;
        public ThemeOptions Current { get; private set; } = new ThemeOptions("#0067C5", "#FF4081", "#FFFFFF", "#111827", 1.0, false);

        public ThemeService(IJSRuntime js)
        {
            _js = js;
        }

        public async Task ApplyAsync(ThemeOptions options)
        {
            Current = options;
            var payload = new
            {
                primary = options.Primary,
                secondary = options.Secondary,
                surface = options.Surface,
                text = options.Text,
                baseFontScale = options.BaseFontScale,
                isDark = options.IsDark
            };

            await _js.InvokeVoidAsync("ytCatalogTheme.applyTheme", payload);
        }

        public Task ToggleDarkAsync()
        {
            var next = Current with { IsDark = !Current.IsDark };
            return ApplyAsync(next);
        }

        public Task ApplyDefaultsAsync() => ApplyAsync(Current);

        public async Task<bool> LoadAndApplyStoredAsync()
        {
            try
            {
                var stored = await _js.InvokeAsync<JsonElement?>("ytCatalogTheme.loadStored");
                if (stored is null || stored?.ValueKind == JsonValueKind.Null) return false;

                var primary = stored?.GetProperty("primary").GetString() ?? Current.Primary;
                var secondary = stored?.GetProperty("secondary").GetString() ?? Current.Secondary;
                var surface = stored?.GetProperty("surface").GetString() ?? Current.Surface;
                var text = stored?.GetProperty("text").GetString() ?? Current.Text;
                var scale = stored?.GetProperty("baseFontScale").GetDouble() ?? Current.BaseFontScale;
                var isDark = stored?.GetProperty("isDark").GetBoolean() ?? Current.IsDark;

                await ApplyAsync(new ThemeOptions(primary, secondary, surface, text, scale, isDark));
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
