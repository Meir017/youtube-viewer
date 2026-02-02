using System.CommandLine;
using System.Text.Json;
using YouTubeCatalog.Core;
using YouTubeCatalog.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

var inputOption = new Option<string?>("--input", "-i")
{
    Description = "Path to input file containing channel ids/handles, one per line"
};
inputOption.Validators.Add(result =>
{
    var value = result.GetValueOrDefault<string?>();
    if (string.IsNullOrWhiteSpace(value))
    {
        result.AddError("--input is required.");
    }
});

var outputOption = new Option<string?>("--output", "-o")
{
    Description = "Output JSON file path",
    DefaultValueFactory = _ => "channels.json"
};

var daysOption = new Option<int>("--days", "-d")
{
    Description = "Lookback window in days",
    DefaultValueFactory = _ => 3650
};

var root = new RootCommand("YouTubeCatalog CLI");
root.Options.Add(inputOption);
root.Options.Add(outputOption);
root.Options.Add(daysOption);

root.SetAction(async (parseResult, cancellationToken) =>
{
    var input = parseResult.GetValue(inputOption);
    var output = parseResult.GetValue(outputOption);
    var days = parseResult.GetValue(daysOption);

    using var services = new ServiceCollection()
        .AddLogging(config => config.AddConsole())
        .AddSingleton<IMemoryCache, MemoryCache>()
        .AddSingleton<YoutubeClientWrapper>()
        .BuildServiceProvider();

    var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("cli");
    var client = services.GetRequiredService<YoutubeClientWrapper>();

    if (string.IsNullOrWhiteSpace(input) || !System.IO.File.Exists(input))
    {
        logger.LogError("Input file not found: {Input}", input);
        return;
    }

    var lines = await System.IO.File.ReadAllLinesAsync(input, cancellationToken);
    var results = new System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>>();

    foreach (var line in lines)
    {
        var ch = line.Trim();
        if (string.IsNullOrWhiteSpace(ch)) continue;
        logger.LogInformation("Fetching channel {Channel}", ch);
        try
        {
            var videos = await client.GetTopViewedVideosAsync(ch, int.MaxValue, days, cancellationToken);
            var list = new System.Collections.Generic.List<object>();
            foreach (var v in videos)
            {
                list.Add(v);
            }
            results.Add(new System.Collections.Generic.Dictionary<string, object>
            {
                ["channel"] = ch,
                ["videos"] = list
            });
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to fetch channel {Channel}", ch);
            results.Add(new System.Collections.Generic.Dictionary<string, object>
            {
                ["channel"] = ch,
                ["error"] = ex.Message
            });
        }
    }

    var json = JsonSerializer.Serialize(results, new JsonSerializerOptions{ WriteIndented = true });
    await System.IO.File.WriteAllTextAsync(output ?? "channels.json", json, cancellationToken);
    logger.LogInformation("Wrote output to {Output}", output ?? "channels.json");
});

return root.Parse(args).Invoke();
