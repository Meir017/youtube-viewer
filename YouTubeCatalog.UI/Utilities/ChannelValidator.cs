using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace YouTubeCatalog.UI.Utilities
{
    /// <summary>
    /// Utility class for validating and extracting YouTube channel IDs from various input formats.
    /// </summary>
    public static class ChannelValidator
    {
        /// <summary>
        /// Validates if a string is a valid YouTube channel ID.
        /// Channel IDs are 24 characters long and start with "UC".
        /// </summary>
        public static bool IsValidChannelId(string input)
        {
            if (string.IsNullOrWhiteSpace(input))
                return false;

            input = input.Trim();
            return Regex.IsMatch(input, @"^UC[a-zA-Z0-9_-]{22}$");
        }

        /// <summary>
        /// Attempts to extract a channel ID from a URL or direct ID.
        /// Supports formats:
        /// - https://www.youtube.com/channel/UC...
        /// - https://www.youtube.com/@username (returns null - requires API lookup)
        /// - UC... (direct ID)
        /// </summary>
        public static string? ExtractChannelId(string urlOrId)
        {
            if (string.IsNullOrWhiteSpace(urlOrId))
                return null;

            urlOrId = urlOrId.Trim();

            // Direct channel ID
            if (IsValidChannelId(urlOrId))
                return urlOrId;

            // Try to extract from /channel/ URL
            var channelMatch = Regex.Match(urlOrId, @"(?:youtube\.com|youtu\.be)(?:/channel/|/)([a-zA-Z0-9_-]+)");
            if (channelMatch.Success && IsValidChannelId(channelMatch.Groups[1].Value))
                return channelMatch.Groups[1].Value;

            // Handle @username format (note: would require additional API call to resolve)
            if (Regex.IsMatch(urlOrId, @"^@[\w.]+$"))
                return null; // Requires API lookup

            return null;
        }

        /// <summary>
        /// Parses multiline input and returns a list of valid channel IDs.
        /// Splits by newline, trims, validates each, and returns only valid IDs.
        /// </summary>
        public static List<string> ParseChannelInput(string multilineInput)
        {
            if (string.IsNullOrWhiteSpace(multilineInput))
                return new List<string>();

            var lines = multilineInput.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            var validIds = new List<string>();

            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (string.IsNullOrWhiteSpace(trimmed))
                    continue;

                var extracted = ExtractChannelId(trimmed);
                if (!string.IsNullOrEmpty(extracted) && !validIds.Contains(extracted))
                {
                    validIds.Add(extracted);
                }
            }

            return validIds;
        }

        /// <summary>
        /// Validates a list of channel IDs and returns validation results.
        /// </summary>
        public static ValidationResult ValidateChannels(IEnumerable<string> channelIds)
        {
            var result = new ValidationResult();

            foreach (var id in channelIds)
            {
                if (IsValidChannelId(id))
                    result.ValidIds.Add(id);
                else
                    result.InvalidIds.Add(id);
            }

            return result;
        }

        public class ValidationResult
        {
            public List<string> ValidIds { get; set; } = new();
            public List<string> InvalidIds { get; set; } = new();
            public bool IsValid => InvalidIds.Count == 0;
        }
    }
}
