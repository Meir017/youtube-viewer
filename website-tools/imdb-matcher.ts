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

import type { Database, Statement } from 'bun:sqlite';
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

// ── Signals for the matcher ─────────────────────────────────────────

/**
 * Generic "noise" candidates that frequently survive cleanup but are not
 * actual title names. These often come from clip-style YouTube titles
 * ("Episode 9 [SPOILERS]" → "spoilers", "The Cast of …" → "the cast"),
 * and would otherwise collide with obscure low-vote IMDB rows.
 *
 * Compared after `normalizeTitle()`.
 */
const NOISE_PHRASES = new Set<string>([
    'the cast', 'spoilers', 'tease', 'recap', 'reunion',
    'sneak peek', 'first look', 'next on', 'previously on',
    'season finale', 'premiere', 'bonus clip', 'exclusive clip',
    'the show', 'cold open', 'cold opens', 'behind the scenes',
    'official trailer', 'official', 'trailer', 'clip',
    'spoiler', 'spoilers alert', 'spoiler alert',
    'reveal', 'revealed', 'announcement',
]);

/**
 * Returns true if the normalized candidate text is a known noise phrase
 * that should not be matched against the IMDB index.
 */
export function isNoiseCandidate(normalizedText: string): boolean {
    return NOISE_PHRASES.has(normalizedText);
}

const TV_FAMILY_TYPES = new Set<string>([
    'tvSeries', 'tvMiniSeries', 'tvShort', 'tvSpecial', 'tvEpisode',
]);

export function isTvFamilyType(titleType: string | null | undefined): boolean {
    return !!titleType && TV_FAMILY_TYPES.has(titleType);
}

/**
 * Detect explicit season/episode tokens in a YouTube video title:
 *   "Season 4", "Seasons 1 & 2", "S3", "S03E07", "Episode 9", "Ep. 12"
 *
 * When true, the matcher restricts candidates to TV-family `titleType`s,
 * because the video is unambiguously about a series — never a one-off film.
 */
export function hasTvSeriesSignal(videoTitle: string): boolean {
    return /\b(?:seasons?\s+\d+|s\d+e\d+|s\d{1,2}\b|episode\s+\d+|ep\.\s*\d+)\b/i.test(videoTitle);
}

/**
 * Extract a normalized set of title-name strings from `#Hashtag` tokens in a
 * description. PascalCase/CamelCase hashtags are split into space-separated
 * words first ("BrooklynNineNine" → "brooklyn nine nine"). Noise hashtags
 * (platform names, generic marketing) are skipped.
 *
 * Used as a CONFIRMATION bonus — when an IMDB candidate row's title appears
 * in this set, it gains a strong score boost.
 */
export function extractHashtagSet(desc: string | null | undefined): Set<string> {
    const out = new Set<string>();
    if (!desc) return out;
    const re = /#([A-Za-z][A-Za-z0-9]{2,60})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(desc)) !== null) {
        const tag = m[1];
        if (NOISE_HASHTAGS.has(tag.toLowerCase())) continue;
        const expanded = splitCamelCase(tag);
        const norm = normalizeTitle(expanded);
        if (norm) out.add(norm);
    }
    return out;
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

/**
 * A title row joined with its rating. Shape returned by SQL queries to the
 * SQLite-backed dataset. `startYear` etc. are nullable here (NULL in the DB
 * for IMDB '\N' markers); previous Map-based code used the literal '\N' string.
 */
export interface MatchedTitle {
    tconst: string;
    titleType: string;
    primaryTitle: string;
    originalTitle: string;
    startYear: string | null;
    endYear: string | null;
    runtimeMinutes: string | null;
    genres: string | null;
    averageRating: number | null;
    numVotes: number | null;
}

export interface MatchResult {
    tconst: string;
    title: MatchedTitle;
    castNames: string[];
    confidence: 'exact' | 'normalized' | 'fuzzy';
}

/**
 * Penalty applied to a candidate based on the gap between its IMDB
 * `startYear` and the YouTube publish year. Trailers/clips are typically
 * uploaded within a few years of the work's release; a 1962 film matched
 * to a video uploaded in 2024 should lose to a 2024 same-titled film.
 *
 * Returns a non-negative penalty (higher = worse). Returns 0 when there is
 * no signal (missing or unparsable years), so this never hurts candidates
 * we cannot evaluate.
 */
export function yearDistancePenalty(startYear: string | null | undefined, publishYear: number | null | undefined): number {
    if (publishYear == null || !startYear) return 0;
    const y = parseInt(startYear, 10);
    if (!Number.isFinite(y)) return 0;
    const diff = publishYear - y;
    // Video uploaded long AFTER the film: small grace window, then linear.
    if (diff > 5) return 0.1 * (diff - 5);
    // Video uploaded BEFORE the film (e.g. teaser years in advance) — small grace.
    if (diff < -4) return 0.2 * (-diff - 4);
    return 0;
}

/**
 * Title matcher backed by a `bun:sqlite` Database produced by `import-imdb`.
 *
 * Replaces the previous in-memory Map-based index. All lookups go through
 * prepared statements; cast resolution is a per-match JOIN against
 * `principals` + `names`.
 */
export class ImdbTitleIndex {
    private db: Database;
    private selectByNorm: Statement;
    private selectCast: Statement;

    constructor(db: Database) {
        this.db = db;
        this.selectByNorm = db.prepare(`
            SELECT t.tconst, t.titleType, t.primaryTitle, t.originalTitle,
                   t.startYear, t.endYear, t.runtimeMinutes, t.genres,
                   r.averageRating, r.numVotes
            FROM title_index ti
            JOIN titles t ON t.tconst = ti.tconst
            LEFT JOIN ratings r ON r.tconst = t.tconst
            WHERE ti.norm_title = ?
        `);
        this.selectCast = db.prepare(`
            SELECT n.primaryName
            FROM principals p
            JOIN names n ON n.nconst = p.nconst
            WHERE p.tconst = ?
            ORDER BY p.ordering
            LIMIT 5
        `);
    }

    /**
     * Match a YouTube video title against the IMDB index.
     * Returns the best match or null. When provided, `description` is used as
     * a fallback source of candidate titles if title-based matching fails;
     * any `#Hashtags` it contains also act as a confirmation bonus.
     * `publishYear` (the YouTube upload year, when known) is used as a soft
     * tiebreaker so that ancient films don't beat modern same-titled releases.
     */
    match(
        videoTitle: string,
        preferredYear?: string | null,
        description?: string | null,
        publishYear?: number | null,
    ): MatchResult | null {
        const { candidates: titleCandidates, year } = extractTitleCandidates(videoTitle);
        const effectiveYear = preferredYear ?? year;
        const tvSeriesOnly = hasTvSeriesSignal(videoTitle);
        const hashtagSet = extractHashtagSet(description);
        const ctx: MatchContext = {
            effectiveYear,
            publishYear: publishYear ?? null,
            tvSeriesOnly,
            hashtagSet,
        };

        // Stage 1: title candidates (with global scoring across all of them).
        const titleScored: ScoredCandidate[] = titleCandidates.map((text, i) => ({
            text,
            source: i === 0 ? 'title-primary' : 'title-other',
            rank: i,
        }));
        const titleHit = this.findBest(titleScored, ctx, 'normalized');
        if (titleHit) return titleHit;

        // Stage 2: fuzzy fallback — drop trailing words off the primary candidate.
        if (titleCandidates.length > 0) {
            const fuzzy: ScoredCandidate[] = [];
            const words = normalizeTitle(titleCandidates[0]).split(' ');
            for (let len = words.length - 1; len >= 2; len--) {
                fuzzy.push({
                    text: words.slice(0, len).join(' '),
                    source: 'fuzzy',
                    rank: words.length - len,
                });
            }
            const fuzzyHit = this.findBest(fuzzy, ctx, 'fuzzy');
            if (fuzzyHit) return fuzzyHit;
        }

        // Stage 3: description fallback.
        if (description) {
            const descCandidates = extractTitleCandidatesFromDescription(description)
                .map<ScoredCandidate>((text, i) => ({ text, source: 'description', rank: i }));
            const descHit = this.findBest(descCandidates, ctx, 'normalized');
            if (descHit) return descHit;
        }

        return null;
    }

    private lookupNormalized(norm: string): MatchedTitle[] {
        return this.selectByNorm.all(norm) as MatchedTitle[];
    }

    /**
     * Look up every candidate, apply per-candidate-group filters
     * (year → TV → 0-vote), then score every surviving (candidate, row) tuple
     * globally and return the best.
     */
    private findBest(
        candidates: ScoredCandidate[],
        ctx: MatchContext,
        confidence: MatchResult['confidence'],
    ): MatchResult | null {
        type Tuple = { candidate: ScoredCandidate; row: MatchedTitle };
        const tuples: Tuple[] = [];

        for (const c of candidates) {
            const norm = normalizeTitle(c.text);
            if (!norm || isNoiseCandidate(norm)) continue;

            let rows = this.lookupNormalized(norm);
            if (rows.length === 0) continue;

            // Hard year filter (preserves current pickBest semantics, per group).
            if (ctx.effectiveYear) {
                const yearRows = rows.filter(r => r.startYear === ctx.effectiveYear);
                if (yearRows.length > 0) rows = yearRows;
            }

            // Hard TV-family filter when video title has Season/Episode signal.
            if (ctx.tvSeriesOnly) {
                const tvRows = rows.filter(r => isTvFamilyType(r.titleType));
                if (tvRows.length > 0) rows = tvRows;
            }

            // Drop 0-vote rows when at least one row in the same group has votes.
            const anyVotes = rows.some(r => (r.numVotes ?? 0) > 0);
            if (anyVotes) rows = rows.filter(r => (r.numVotes ?? 0) > 0);

            for (const row of rows) tuples.push({ candidate: c, row });
        }

        if (tuples.length === 0) return null;

        let best = tuples[0];
        let bestScore = -Infinity;
        for (const t of tuples) {
            const s = scoreTuple(t.row, t.candidate, ctx);
            if (s > bestScore) {
                bestScore = s;
                best = t;
            }
        }

        return this.buildResult(best.row, confidence);
    }

    private buildResult(title: MatchedTitle, confidence: MatchResult['confidence']): MatchResult {
        const castRows = this.selectCast.all(title.tconst) as { primaryName: string }[];
        return {
            tconst: title.tconst,
            title,
            castNames: castRows.map(r => r.primaryName),
            confidence,
        };
    }
}

// ── Scoring ──────────────────────────────────────────────────────────

interface ScoredCandidate {
    text: string;
    source: 'title-primary' | 'title-other' | 'fuzzy' | 'description';
    /** 0-based position within `source` (0 = best). */
    rank: number;
}

interface MatchContext {
    effectiveYear: string | null;
    publishYear: number | null;
    tvSeriesOnly: boolean;
    hashtagSet: Set<string>;
}

const SOURCE_QUALITY: Record<ScoredCandidate['source'], number> = {
    'title-primary': 3,
    'title-other': 1.5,
    'description': 0.5,
    'fuzzy': 0,
};

/**
 * Composite ranker for a single (candidate, row) tuple.
 *
 *   score = source-quality
 *         + log10(votes)           (vote popularity, ≈0–7)
 *         + movie-type bonus       (suppressed when tvSeriesOnly)
 *         + hashtag-confirmation bonus
 *         − tv-aware year-distance penalty
 *
 * Returns a real number; higher is better.
 */
export function scoreTuple(row: MatchedTitle, candidate: ScoredCandidate, ctx: MatchContext): number {
    let score = SOURCE_QUALITY[candidate.source] - candidate.rank * 0.1;

    const votes = row.numVotes ?? 0;
    score += votes > 0 ? Math.log10(votes) : 0;

    // Movie-type bonus only when not in TV-signal mode (TV mode hard-filters
    // upstream, but if no TV rows exist we fall back to all rows — and in
    // that case a movie should not get a free bonus).
    if (!ctx.tvSeriesOnly && row.titleType === 'movie') score += 1.5;

    // Hashtag confirmation: the row's title appears in a description hashtag.
    if (ctx.hashtagSet.size > 0) {
        const titleNorm = normalizeTitle(row.primaryTitle ?? '');
        const origNorm = normalizeTitle(row.originalTitle ?? '');
        if ((titleNorm && ctx.hashtagSet.has(titleNorm))
            || (origNorm && ctx.hashtagSet.has(origNorm))) {
            score += 3;
        }
    }

    score -= tvAwareYearPenalty(row, ctx.publishYear);
    return score;
}

/**
 * Year-distance penalty that knows the difference between a one-off film and
 * a long-running TV series. Movies use the original `yearDistancePenalty`
 * curve; TV-family rows are only penalized when they ended ≥5 years before
 * the upload year (ongoing or recently-ended series get a free pass — clips
 * from a 1975 series uploaded in 2026 are normal).
 */
export function tvAwareYearPenalty(
    row: Pick<MatchedTitle, 'titleType' | 'startYear' | 'endYear'>,
    publishYear: number | null | undefined,
): number {
    if (publishYear == null || !row.startYear) return 0;
    const start = parseInt(row.startYear, 10);
    if (!Number.isFinite(start)) return 0;

    // Video uploaded BEFORE the work's release: small grace, then linear
    // (applies to both movies and TV).
    if (publishYear - start < -4) return 0.2 * (start - publishYear - 4);

    if (isTvFamilyType(row.titleType)) {
        // Ongoing or unknown end → no penalty.
        const endRaw = row.endYear;
        if (!endRaw || endRaw === '\\N') return 0;
        const end = parseInt(endRaw, 10);
        if (!Number.isFinite(end)) return 0;
        // 5-year grace after the show ended (clip channels keep posting).
        if (publishYear <= end + 5) return 0;
        return 0.05 * (publishYear - end - 5);
    }

    // Movies: existing curve.
    return yearDistancePenalty(row.startYear, publishYear);
}

/**
 * Convert a MatchResult into the ImdbData shape stored on Video objects.
 */
export function matchToImdbData(match: MatchResult): ImdbData {
    const t = match.title;
    return {
        tconst: match.tconst,
        primaryTitle: t.primaryTitle,
        titleType: t.titleType,
        startYear: t.startYear ?? '',
        runtimeMinutes: t.runtimeMinutes ?? '',
        genres: t.genres ?? '',
        averageRating: t.averageRating != null ? String(t.averageRating) : '',
        numVotes: t.numVotes != null ? String(t.numVotes) : '',
        cast: match.castNames,
    };
}
