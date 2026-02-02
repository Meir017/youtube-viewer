using Serilog;
using System.Diagnostics;
using System.Threading;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog for structured logging

// Configure Serilog for structured logging
Log.Logger = new LoggerConfiguration()
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateLogger();

builder.Host.UseSerilog();

// Add services to the container.
// Add Controllers
builder.Services.AddControllers();

// Configure OpenAPI / Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Register core services
builder.Services.AddSingleton<YouTubeCatalog.Api.Services.CatalogService>();
builder.Services.AddSingleton<YouTubeCatalog.Core.IYoutubeClient, YouTubeCatalog.Api.Services.YoutubeClientWrapper>();

// Background refresh options and worker registration
var _backgroundRefreshOptions = new YouTubeCatalog.Api.BackgroundRefreshOptions();
builder.Configuration.GetSection("BackgroundRefresh").Bind(_backgroundRefreshOptions);
builder.Services.AddSingleton(_backgroundRefreshOptions);
builder.Services.AddMemoryCache();
builder.Services.AddHostedService<YouTubeCatalog.Api.Services.BackgroundRefreshWorker>();

// Add simple metrics service
builder.Services.AddSingleton<MetricsService>();

var app = builder.Build();

// Simple request timing & correlation-id middleware
app.Use(async (context, next) =>
{
    var sw = Stopwatch.StartNew();
    var correlationId = context.Request.Headers["X-Correlation-ID"].FirstOrDefault() ?? Guid.NewGuid().ToString();
    context.Response.Headers["X-Correlation-ID"] = correlationId;
    using (Serilog.Context.LogContext.PushProperty("CorrelationId", correlationId))
    {
        await next();
    }
    sw.Stop();
    var metrics = app.Services.GetRequiredService<MetricsService>();
    metrics.RecordRequest(context.Request.Path, sw.Elapsed);
});

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Map controllers
app.MapControllers();

app.Run();

public class MetricsService
{
    private long _totalRequests;
    private long _totalMilliseconds;

    public void RecordRequest(string path, TimeSpan duration)
    {
        Interlocked.Increment(ref _totalRequests);
        Interlocked.Add(ref _totalMilliseconds, (long)duration.TotalMilliseconds);
        Log.Information("Request {Path} took {Duration}ms", path, duration.TotalMilliseconds);
    }

    public object Snapshot()
    {
        var total = Interlocked.Read(ref _totalRequests);
        var totalMs = Interlocked.Read(ref _totalMilliseconds);
        return new
        {
            totalRequests = total,
            avgLatencyMs = total == 0 ? 0 : totalMs / (double)total,
            cacheHitRatio = 0.0 // placeholder until cache instrumentation is added
        };
    }
}


