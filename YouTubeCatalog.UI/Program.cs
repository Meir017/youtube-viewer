using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using YouTubeCatalog.UI.Services;
using Microsoft.Fast.Components.FluentUI;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor();

// FluentUI (Microsoft.Fast.Components.FluentUI) service registration
// NOTE: package added to central package management (Directory.Packages.props)
builder.Services.AddFluentUIComponents();

// Theme service (applies CSS design tokens and persists preference)
builder.Services.AddScoped<YouTubeCatalog.UI.Services.ThemeService>();

// Local-file UI mode options (feature-gated)
var localFileMode = builder.Configuration.GetValue<bool>("LocalFileMode");
if (localFileMode)
{
    // register provider used by components for offline/dev demos
    builder.Services.Configure<YouTubeCatalog.UI.Services.LocalFileOptions>(builder.Configuration);
    builder.Services.AddSingleton<YouTubeCatalog.UI.Services.ILocalCatalogProvider, YouTubeCatalog.UI.Services.LocalCatalogProvider>();
}

// Register CatalogApiClient for HTTP communication with API
builder.Services.AddHttpClient<CatalogApiClient>(client =>
{
    var apiBaseUrl = builder.Configuration["ApiBaseUrl"] ?? "https://localhost:5001";
    client.BaseAddress = new Uri(apiBaseUrl);
    client.Timeout = TimeSpan.FromSeconds(30);
});

var app = builder.Build();

// Emit startup telemetry/logging via the app's DI logging pipeline so test providers can capture it
if (localFileMode)
{
    try
    {
        var logger = app.Services.GetRequiredService<Microsoft.Extensions.Logging.ILogger<Program>>();
        logger.LogInformation(new Microsoft.Extensions.Logging.EventId(1001, "LocalFileModeEnabled"), "LocalFileMode enabled; source={Source}", builder.Configuration["LocalFilePath"] ?? "bundled-sample");
    }
    catch { /* best-effort: don't crash startup for logging failures */ }
}

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseStaticFiles();

app.UseRouting();

app.MapBlazorHub();
app.MapFallbackToPage("/_Host");

app.Run();
