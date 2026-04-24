/**
 * Fuzzy title matcher: extracts likely movie/show names from YouTube video
 * titles and matches them against an IMDB title index.
 *
 * YouTube trailer titles follow wildly inconsistent patterns. Real examples:
 *
 *   "BEEF: Season 2 | Official Trailer | Netflix"
 *   "Scream 7 | Final Trailer (2026 Movie) – Neve Campbell, Courteney Cox"
 *   "COUPLES WEEKEND Official Trailer (2026) Alexandra Daddario"
 *   "Oppenheimer | New Trailer"
 *   "The Boys | Clip | Prime Video"
 *   "Dune: Part Three | Teaser Trailer Event"
 *   "Lionsgate's Beast (2026) Official Blu-ray Trailer - Daniel MacPherson"
 *   "TOMMY (1975) - Official IMAX Trailer (HD)"
 *   "Masters of The Universe – Official Trailer"
 *
 * Strategy:
 *   1. Extract candidate title from the YouTube video title
 *   2. Normalize both candidate and IMDB titles (lowercase, strip punctuation)
 *   3. Look up in a pre-built index keyed by normalized title
 *   4. If year is available, prefer matches where year matches
 */

import type { TitleBasics, TitleRating, ImdbDataset } from './imdb-parser';
import { resolveNames, isImdbNull } from './imdb-parser';
import type { ImdbData } from '../generator/types';

// ── Title extraction from YouTube video titles ───────────────────────

// Channel/platform suffixes that appear at end after a pipe/dash
const PLATFORM_NAMES = [
    'netflix', 'hulu', 'prime video', 'amazon prime', 'hbo', 'hbo max',
    'apple tv', 'apple tv+', 'disney+', 'disney plus', 'peacock',
    'paramount+', 'paramount plus', 'a24', 'amazon mgm', 'focus features',
    'lionsgate', 'universal pictures', 'warner bros', 'sony pictures',
];

// Patterns to strip from the title (case-insensitive)
const STRIP_PATTERNS = [
    // Trailer/teaser/clip variants
    /\b(?:official\s+)?(?:final\s+)?(?:teaser\s+)?trailer(?:\s+event)?\b/i,
    /\b(?:official\s+)?teaser(?:\s+trailer)?\b/i,
    /\b(?:official\s+)?clip\b/i,
    /\bsneak\s+peek\b/i,
    /\bfeaturette\b/i,
    /\bbehind\s+the\s+scenes\b/i,
    /\bfull\s+scene\b/i,
    /\bofficial\s+promo\b/i,
    /\bofficial\b/i,

    // Quality/format markers
    /\b(?:4k|hd|uhd|imax|hdr\d*\+?|blu-?ray|70mm)\b/i,

    // Year in parentheses: (2026), (1975), (2026 Movie)
    /\(\d{4}(?:\s+movie)?\)/i,

    // "Season X" / "Seasons X & Y" / "S1-4" etc
    /\bseasons?\s+\d[\d&\s\-]*/i,
    /\bs\d[\d\-]*/i,

    // Episode references
    /\bepisode\s+\d+\b/i,

    // Scene/compilation indicators (often not the title)
    /\bcompilation\b/i,
    /\bfull\s+scene\b/i,
    /\bblooper(?:s|reel)?\b/i,
    /\brecap\b/i,

    // "New" prefix for trailers
    /\bnew\s+trailer\b/i,

    // Descriptive suffixes: "Tickets On Sale", "Stream On...", etc.
    /\btickets?\s+on\s+sale\b/i,
    /\bstream\s+on\b.*/i,
    /\bnow\s+streaming\b/i,
    /\bnow\s+playing\b.*/i,
    /\bonly\s+in\s+theaters?\b.*/i,
    /\bin\s+theaters?\s+(?:now|this|[a-z]+day|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)\b.*/i,

    // Common Movie-Trailers-collection clip noise
    /\bcold\s+opens?\b/i,
    /\breunion\b/i,
    /\bpodcast\b/i,
    /\bbravocon\b.*/i,

    // Title reveal / announcement
    /\btitle\s+reveal\b/i,
    /\bannouncement\b/i,
];

/**
 * Extract the most likely movie/show name from a YouTube video title.
 * Returns an array of candidates (best first), plus an optional year.
 */
export function extractTitleCandidates(videoTitle: string): { candidates: string[]; year: string | null } {
    let title = videoTitle.trim();
    const candidates: string[] = [];

    // Extract year if present: (2023), (2026 Movie), or standalone 4-digit year
    let year: string | null = null;
    const yearMatch = title.match(/\((\d{4})(?:\s+movie)?\)/i) || title.match(/\b((?:19|20)\d{2})\b/);
    if (yearMatch) {
        year = yearMatch[1];
    }

    // Split on pipe | or em-dash — but NOT on hyphen - (which appears in titles like "Spider-Man")
    // Common pattern: "Title | Something | Platform"
    const pipeParts = title.split(/\s*[\|–—]\s*/);

    if (pipeParts.length >= 2) {
        // First segment is usually the title
        candidates.push(pipeParts[0].trim());

        // Sometimes first two segments form the title: "The Boys | Clip" → want "The Boys"
        // But "Bloopers | Percy Jackson" means second segment is the title
        const first = pipeParts[0].trim().toLowerCase();
        const isFirstDescriptive = /^(?:bloopers?|recap|next on|recording|behind)/i.test(first);
        if (isFirstDescriptive && pipeParts.length >= 2) {
            candidates.unshift(pipeParts[1].trim());
        }

        // Also try first two segments joined (for "Homelander Gets Revenge | The Boys")
        if (pipeParts.length >= 3) {
            candidates.push(pipeParts.slice(0, 2).join(' ').trim());
        }

        // Try every middle/last segment as a candidate too — TV-show clips often put
        // the show name after the clip description, e.g.
        //   "Li'l Sebastian: ... | Parks and Recreation"
        //   "How Stunts In ... | The Last of Us Season 2 | Max"
        // Skip segments that are just a platform name.
        for (let i = 1; i < pipeParts.length; i++) {
            const seg = pipeParts[i].trim();
            if (!seg) continue;
            if (isPlatformSegment(seg)) continue;
            candidates.push(seg);
        }
    }

    // Also try the full title with cleanup (catches patterns without pipes)
    candidates.push(title);

    // For titles with " - " as separator (common in Lionsgate, Sony, etc.)
    // "TOMMY (1975) - Official IMAX Trailer (HD)"
    const dashParts = title.split(/\s+-\s+/);
    if (dashParts.length >= 2) {
        candidates.push(dashParts[0].trim());
    }

    // Clean up each candidate. For candidates with a leading possessive (e.g.
    // "Lionsgate's Beast"), also try a variant with the possessive stripped, in
    // addition to the original — this avoids chopping real titles like
    // "All's Fair" while still recovering titles prefixed with a studio name.
    const expanded: string[] = [];
    for (const c of candidates) {
        expanded.push(c);
        const m = c.match(/^\S+(?:'s|\u2019s)\s+(.+)$/i);
        if (m && m[1].trim().length >= 2) expanded.push(m[1].trim());
    }

    // Clean up each candidate; drop anything too short to be a real title
    const cleaned = expanded
        .map(c => cleanCandidate(c))
        .filter(c => c.length >= 2 && !/^(?:the|a|an)$/i.test(c));

    // Deduplicate while preserving order
    const seen = new Set<string>();
    const unique = cleaned.filter(c => {
        const norm = c.toLowerCase();
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
    });

    return { candidates: unique, year };
}

function cleanCandidate(raw: string): string {
    let s = raw;

    // Strip leading pipe/separator leftovers from candidate splitting
    s = s.replace(/^[\s|–—\-]+/, '');

    // Remove platform names from end (and anywhere after a separator)
    for (const platform of PLATFORM_NAMES) {
        const re = new RegExp(`\\s*[\\|–—\\-]?\\s*${escapeRegex(platform)}\\s*$`, 'i');
        s = s.replace(re, '');
    }

    // Remove year in parens early (before strip patterns, so "(2026)" doesn't interfere)
    s = s.replace(/\s*\(\d{4}(?:\s+movie)?\)\s*/gi, ' ');

    // Apply strip patterns
    for (const pattern of STRIP_PATTERNS) {
        s = s.replace(pattern, '');
    }

    // (Leading possessive studios like "Lionsgate's Beast" are handled by
    // generating an extra candidate in extractTitleCandidates, not here, so that
    // real titles containing a possessive — "All's Fair" — aren't destroyed.)

    // Remove "Nth Anniversary" patterns
    s = s.replace(/\s*\d+(?:st|nd|rd|th)\s+anniversary\b/gi, '');

    // Remove trailing cast names: " - FirstName LastName, FirstName LastName"
    // Also handles " Actor, Actor" without a dash at the very end
    s = s.replace(/\s*[-–—]\s*(?:[A-Z][a-z]+\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?(?:\s*,\s*[A-Z][a-z]+\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?)*)\s*$/, '');

    // Remove standalone cast names at end (no dash, e.g. "TITLE Alexandra Daddario")
    // Only strip if it looks like 2+ "FirstName LastName" pairs separated by commas
    s = s.replace(/\s+(?:[A-Z][a-z]+\s+[A-Z][a-z']+(?:\s*,\s*[A-Z][a-z]+\s+[A-Z][a-z']+)+)\s*$/, '');

    // Remove "Ft." / "Feat." / "Featuring" sections — only when preceded by a
    // separator (paren, bracket, comma, dash, pipe) or whitespace, AND require the
    // period on "ft"/"feat" so we don't chop real words like "Minecraft" or "Defeat".
    s = s.replace(/(?:^|[\s\(\[,\-–—|])(?:ft\.|feat\.|featuring\b)\s+.*$/i, '');

    // Remove empty parentheses left behind
    s = s.replace(/\(\s*\)/g, '');

    // Collapse whitespace and trim
    s = s.replace(/\s+/g, ' ').trim();

    // Remove trailing punctuation/separators
    s = s.replace(/[\s|–—\-:,]+$/, '').trim();

    return s;
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Detect a pipe segment that's just a platform/network name (possibly with a
// leading/trailing "official trailer" etc.) — these aren't useful candidates.
function isPlatformSegment(seg: string): boolean {
    const stripped = seg
        .toLowerCase()
        .replace(/\b(?:official\s+)?(?:final\s+)?(?:teaser\s+)?trailer\s*\d*\b/gi, '')
        .replace(/[^\w\s+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!stripped) return true;
    return PLATFORM_NAMES.some(p => stripped === p || stripped === p.replace(/\s+/g, ''));
}

// ── Description-based candidate extraction ──────────────────────────

// Hashtags that are NOT title names (platforms/generic marketing).
const NOISE_HASHTAGS = new Set([
    'peacock', 'hulu', 'netflix', 'primevideo', 'amazonprime', 'hbo', 'hbomax',
    'max', 'appletv', 'disney', 'disneyplus', 'paramount', 'paramountplus',
    'a24', 'lionsgate', 'sonypictures', 'universalpictures', 'warnerbros',
    'focusfeatures', 'movie', 'movies', 'trailer', 'trailers', 'officialtrailer',
    'film', 'streaming', 'newmovie', 'newtrailer', 'tvshow', 'tvseries',
    'comedy', 'drama', 'action', 'horror', 'thriller', 'scifi', 'fantasy',
    'animation', 'documentary', 'foryou', 'fyp', 'viral', 'shorts',
]);

/**
 * Split a camelCase / PascalCase hashtag into whitespace-separated words.
 *   "JurassicWorldRebirth" → "Jurassic World Rebirth"
 *   "WickedForGood"        → "Wicked For Good"
 */
function splitCamelCase(s: string): string {
    return s
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .trim();
}

/**
 * Extract likely movie/show names from a YouTube video description.
 * Returns candidate title strings (best first) to try against the IMDB index
 * when title-based matching fails.
 */
export function extractTitleCandidatesFromDescription(desc: string): string[] {
    if (!desc) return [];
    const candidates: string[] = [];

    // 1. "Watch <Title> Streaming on <Platform>" / "Watch <Title> on <Platform>"
    //    Very reliable signal for Peacock/Hulu/Max clip-style videos.
    const watchRe = /\bWatch\s+([A-Z][^\n|:]{2,80}?)\s+(?:Streaming(?:\s+Now)?\s+on|on)\s+[A-Z]/g;
    let m: RegExpExecArray | null;
    while ((m = watchRe.exec(desc)) !== null) {
        candidates.push(m[1].trim());
    }

    // 2. "<Title> is (now) streaming on <Platform>"
    //    "<Title> premieres <date> on <Platform>"
    const premRe = /\b([A-Z][A-Za-z0-9 '\u2019:,!?&.\-]{2,60}?)\s+(?:is\s+now\s+streaming|premieres|arrives|returns)\s+/g;
    while ((m = premRe.exec(desc)) !== null) {
        candidates.push(m[1].trim());
    }

    // 3. Hashtag expansion: "#JurassicWorldRebirth" → "Jurassic World Rebirth"
    //    Skip noise hashtags (platform names, generic marketing).
    const hashRe = /#([A-Za-z][A-Za-z0-9]{2,60})/g;
    while ((m = hashRe.exec(desc)) !== null) {
        const tag = m[1];
        if (NOISE_HASHTAGS.has(tag.toLowerCase())) continue;
        const expanded = splitCamelCase(tag);
        // Only useful if it actually split into multiple words
        if (/\s/.test(expanded)) candidates.push(expanded);
    }

    // 4. Quoted titles: "Some Title" or \u201CSome Title\u201D — only when the
    //    quoted phrase looks like a title (Title Case, no trailing punctuation).
    const quoteRe = /["\u201C]([A-Z][^"\u201D\n]{2,60})["\u201D]/g;
    while ((m = quoteRe.exec(desc)) !== null) {
        const q = m[1].trim();
        // Skip obvious non-titles (contain a lowercase-only word that looks like a sentence fragment)
        if (/[.!?]$/.test(q)) continue;
        candidates.push(q);
    }

    // Clean / dedupe; reuse cleanCandidate to strip common noise
    const cleaned = candidates
        .map(c => cleanCandidate(c))
        .filter(c => c.length >= 2 && !/^(?:the|a|an)$/i.test(c));

    const seen = new Set<string>();
    return cleaned.filter(c => {
        const norm = c.toLowerCase();
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
    });
}

// ── Normalization for index matching ─────────────────────────────────

/**
 * Normalize a title for comparison: lowercase, strip punctuation/articles,
 * collapse whitespace.
 */
export function normalizeTitle(title: string): string {
    return title
        .toLowerCase()
        // Normalize Unicode curly/typographic apostrophes to ASCII '
        .replace(/[\u2018\u2019\u02BC\u02B9\u2032]/g, "'")
        .replace(/[^\w\s']/g, ' ')   // strip punctuation except apostrophe
        .replace(/\s+/g, ' ')        // collapse whitespace
        .trim();
}

// ── IMDB Title Index ─────────────────────────────────────────────────

interface IndexEntry {
    tconst: string;
    title: TitleBasics;
    normalizedPrimary: string;
    normalizedOriginal: string;
}

export interface MatchResult {
    tconst: string;
    title: TitleBasics;
    rating: TitleRating | undefined;
    castNames: string[];
    confidence: 'exact' | 'normalized' | 'fuzzy';
}

export class ImdbTitleIndex {
    // normalized title → entries (multiple titles can normalize the same)
    private index = new Map<string, IndexEntry[]>();
    private dataset: ImdbDataset;

    constructor(dataset: ImdbDataset) {
        this.dataset = dataset;
        this.buildIndex();
    }

    private buildIndex(): void {
        for (const [tconst, title] of this.dataset.titles) {
            const entry: IndexEntry = {
                tconst,
                title,
                normalizedPrimary: normalizeTitle(title.primaryTitle),
                normalizedOriginal: normalizeTitle(title.originalTitle),
            };

            // Index by both primary and original title
            for (const norm of [entry.normalizedPrimary, entry.normalizedOriginal]) {
                if (!norm) continue;
                const existing = this.index.get(norm);
                if (existing) {
                    existing.push(entry);
                } else {
                    this.index.set(norm, [entry]);
                }
            }
        }
    }

    /**
     * Match a YouTube video title against the IMDB index.
     * Returns the best match or null. When provided, `description` is used as
     * a fallback source of candidate titles if title-based matching fails.
     */
    match(videoTitle: string, preferredYear?: string | null, description?: string | null): MatchResult | null {
        const { candidates, year } = extractTitleCandidates(videoTitle);
        const effectiveYear = preferredYear ?? year;

        const titleMatch = this.matchCandidates(candidates, effectiveYear, 'normalized');
        if (titleMatch) return titleMatch;

        // Fuzzy fallback on the primary title candidate
        if (candidates.length > 0) {
            const words = normalizeTitle(candidates[0]).split(' ');
            for (let len = words.length - 1; len >= 2; len--) {
                const prefix = words.slice(0, len).join(' ');
                const entries = this.index.get(prefix);
                if (entries && entries.length > 0) {
                    const best = this.pickBest(entries, effectiveYear);
                    if (best) {
                        return this.buildResult(best, 'fuzzy');
                    }
                }
            }
        }

        // Description fallback: extract titles from the video description
        if (description) {
            const descCandidates = extractTitleCandidatesFromDescription(description);
            if (descCandidates.length > 0) {
                const descMatch = this.matchCandidates(descCandidates, effectiveYear, 'normalized');
                if (descMatch) return descMatch;
            }
        }

        return null;
    }

    private matchCandidates(
        candidates: string[],
        effectiveYear: string | null,
        confidence: MatchResult['confidence'],
    ): MatchResult | null {
        for (const candidate of candidates) {
            const normalized = normalizeTitle(candidate);
            if (!normalized) continue;

            const entries = this.index.get(normalized);
            if (entries && entries.length > 0) {
                const best = this.pickBest(entries, effectiveYear);
                if (best) {
                    return this.buildResult(best, confidence);
                }
            }
        }
        return null;
    }

    private pickBest(entries: IndexEntry[], year: string | null): IndexEntry | null {
        if (entries.length === 1) return entries[0];

        // Prefer year match
        if (year) {
            const yearMatches = entries.filter(e => e.title.startYear === year);
            if (yearMatches.length === 1) return yearMatches[0];
            if (yearMatches.length > 1) {
                // Among year matches, prefer movie over series
                return this.preferMovieType(yearMatches);
            }
        }

        // Prefer movie type, then higher vote count
        return this.preferMovieType(entries);
    }

    private preferMovieType(entries: IndexEntry[]): IndexEntry {
        const movies = entries.filter(e => e.title.titleType === 'movie');
        const pool = movies.length > 0 ? movies : entries;

        // Pick the one with the most votes (most likely the "real" one)
        let best = pool[0];
        let bestVotes = 0;

        for (const entry of pool) {
            const rating = this.dataset.ratings.get(entry.tconst);
            const votes = rating ? parseInt(rating.numVotes, 10) : 0;
            if (votes > bestVotes) {
                bestVotes = votes;
                best = entry;
            }
        }

        return best;
    }

    private buildResult(entry: IndexEntry, confidence: MatchResult['confidence']): MatchResult {
        const rating = this.dataset.ratings.get(entry.tconst);
        const castNconsts = this.dataset.cast.get(entry.tconst) || [];
        const castNames = resolveNames(castNconsts, this.dataset.names);

        return {
            tconst: entry.tconst,
            title: entry.title,
            rating,
            castNames,
            confidence,
        };
    }
}

/**
 * Convert a MatchResult into the ImdbData shape stored on Video objects.
 */
export function matchToImdbData(match: MatchResult): ImdbData {
    return {
        tconst: match.tconst,
        primaryTitle: match.title.primaryTitle,
        titleType: match.title.titleType,
        startYear: isImdbNull(match.title.startYear) ? '' : match.title.startYear,
        runtimeMinutes: isImdbNull(match.title.runtimeMinutes) ? '' : match.title.runtimeMinutes,
        genres: isImdbNull(match.title.genres) ? '' : match.title.genres,
        averageRating: match.rating?.averageRating ?? '',
        numVotes: match.rating?.numVotes ?? '',
        cast: match.castNames,
    };
}
