using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace YouTubeCatalog.Tests.TestLogging
{
    internal class TestLoggerProvider : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> _dest;
        public TestLoggerProvider(ConcurrentQueue<string> dest) => _dest = dest;
        public ILogger CreateLogger(string categoryName) => new TestLogger(categoryName, _dest);
        public void Dispose() { }

        private class TestLogger : ILogger
        {
            private readonly string _category;
            private readonly ConcurrentQueue<string> _dest;
            public TestLogger(string category, ConcurrentQueue<string> dest) { _category = category; _dest = dest; }
            public IDisposable BeginScope<TState>(TState state) => NullScope.Instance;
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                try
                {
                    var msg = formatter(state, exception);
                    _dest.Enqueue($"{logLevel}: {_category}: {eventId.Id}/{eventId.Name ?? ""} - {msg}");
                }
                catch { }
            }

            private class NullScope : IDisposable { public static NullScope Instance { get; } = new NullScope(); public void Dispose() { } }
        }
    }
} 