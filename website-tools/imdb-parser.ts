/**
 * Streaming parser for IMDB Non-Commercial TSV dataset files.
 *
 * Reads gzipped TSV files line-by-line and builds in-memory Maps
 * for the four datasets needed for video enrichment:
 *   - title.basics.tsv.gz  → titles (filtered to movie/series types)
 *   - title.ratings.tsv.gz → ratings
 *   - name.basics.tsv.gz   → person names
 *   - title.principals.tsv.gz → top cast per title
 *
 * All IMDB TSV files are UTF-8, tab-separated, with '\N' as the null marker.
 * First line is always headers.
 */

import { createReadStream, existsSync } from 'fs';
import { createGunzip } from 'zlib';
import path from 'path';
import { createProgress } from './progress';

// ── Types matching actual IMDB TSV schemas ───────────────────────────

export interface TitleBasics {
    tconst: string;       // e.g. "tt0000001"
    titleType: string;    // e.g. "movie", "tvSeries"
    primaryTitle: string; // e.g. "Oppenheimer"
    originalTitle: string;
    isAdult: string;      // "0" or "1"
    startYear: string;    // "2023" or "\N"
    endYear: string;      // "\N" for non-series
    runtimeMinutes: string;
    genres: string;       // comma-separated, e.g. "Drama,History,Thriller"
}

export interface TitleRating {
    averageRating: string; // e.g. "8.3"
    numVotes: string;      // e.g. "850000"
}

// titleType values we care about for movie/TV enrichment.
// Excludes: tvEpisode (~9.6M rows), short, video, videoGame, tvShort, tvPilot
const RELEVANT_TITLE_TYPES = new Set([
    'movie',
    'tvSeries',
    'tvMiniSeries',
    'tvMovie',
    'tvSpecial',
]);

const NULL_MARKER = '\\N';

// ── Streaming line reader ────────────────────────────────────────────

/**
 * Fast line-by-line reader for gzipped TSV files.
 * Uses chunk-based parsing instead of readline for better performance
 * on large files (name.basics is 15M rows, title.principals is 98M rows).
 *
 * When `progressLabel` is provided, a throttled progress line is emitted to
 * stdout showing rows scanned, rate, and elapsed time. The label should be
 * a short human-readable description (e.g. "📥 title.basics").
 */
async function processGzipTsv(
    filePath: string,
    onRow: (cols: string[]) => void,
    progressLabel?: string,
): Promise<void> {
    const gunzip = createGunzip();
    const stream = createReadStream(filePath).pipe(gunzip);

    let remainder = '';
    let isHeader = true;
    let rowCount = 0;
    const progress = progressLabel ? createProgress(progressLabel) : null;

    for await (const chunk of stream) {
        const data = remainder + (chunk as Buffer).toString('utf-8');
        const lines = data.split('\n');

        // Last element may be incomplete — save for next chunk
        remainder = lines.pop() ?? '';

        for (const line of lines) {
            if (isHeader) {
                isHeader = false;
                continue;
            }
            const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
            if (trimmed.length === 0) continue;
            onRow(trimmed.split('\t'));
            rowCount++;
        }

        progress?.tick(rowCount);
    }

    // Process any remaining data
    if (remainder.length > 0 && !isHeader) {
        const trimmed = remainder.endsWith('\r') ? remainder.slice(0, -1) : remainder;
        if (trimmed.length > 0) {
            onRow(trimmed.split('\t'));
            rowCount++;
        }
    }

    progress?.done();
}

// ── Individual dataset parsers ───────────────────────────────────────

/**
 * Parse title.basics.tsv.gz → Map<tconst, TitleBasics>
 * Only keeps titles with titleType in RELEVANT_TITLE_TYPES.
 *
 * Columns (9):
 *   tconst | titleType | primaryTitle | originalTitle | isAdult | startYear | endYear | runtimeMinutes | genres
 */
export async function parseTitleBasics(
    imdbDir: string,
    progressLabel?: string,
): Promise<Map<string, TitleBasics>> {
    const filePath = path.join(imdbDir, 'title.basics.tsv.gz');
    const map = new Map<string, TitleBasics>();
    let total = 0;

    await processGzipTsv(filePath, (cols) => {
        total++;
        const titleType = cols[1];
        if (!RELEVANT_TITLE_TYPES.has(titleType)) return;

        map.set(cols[0], {
            tconst: cols[0],
            titleType,
            primaryTitle: cols[2],
            originalTitle: cols[3],
            isAdult: cols[4],
            startYear: cols[5],
            endYear: cols[6],
            runtimeMinutes: cols[7],
            genres: cols[8],
        });
    }, progressLabel);

    console.log(`   title.basics: ${total.toLocaleString()} rows scanned, ${map.size.toLocaleString()} relevant titles kept`);
    return map;
}

/**
 * Parse title.ratings.tsv.gz → Map<tconst, TitleRating>
 *
 * Columns (3):
 *   tconst | averageRating | numVotes
 */
export async function parseTitleRatings(
    imdbDir: string,
    progressLabel?: string,
): Promise<Map<string, TitleRating>> {
    const filePath = path.join(imdbDir, 'title.ratings.tsv.gz');
    const map = new Map<string, TitleRating>();

    await processGzipTsv(filePath, (cols) => {
        map.set(cols[0], {
            averageRating: cols[1],
            numVotes: cols[2],
        });
    }, progressLabel);

    console.log(`   title.ratings: ${map.size.toLocaleString()} entries`);
    return map;
}

/**
 * Parse name.basics.tsv.gz → Map<nconst, primaryName>
 * Loads ALL names (15M+ rows). Prefer parseNameBasicsFiltered for large datasets.
 *
 * Columns (6):
 *   nconst | primaryName | birthYear | deathYear | primaryProfession | knownForTitles
 */
export async function parseNameBasics(imdbDir: string): Promise<Map<string, string>> {
    const filePath = path.join(imdbDir, 'name.basics.tsv.gz');
    const map = new Map<string, string>();

    await processGzipTsv(filePath, (cols) => {
        map.set(cols[0], cols[1]);
    });

    console.log(`   name.basics: ${map.size.toLocaleString()} names`);
    return map;
}

/**
 * Parse name.basics.tsv.gz but only keep names in the provided nconst set.
 * Much faster memory-wise than loading all 15M names.
 */
export async function parseNameBasicsFiltered(
    imdbDir: string,
    neededNconsts: Set<string>,
    progressLabel?: string,
): Promise<Map<string, string>> {
    const filePath = path.join(imdbDir, 'name.basics.tsv.gz');
    const map = new Map<string, string>();
    let scanned = 0;

    await processGzipTsv(filePath, (cols) => {
        scanned++;
        if (neededNconsts.has(cols[0])) {
            map.set(cols[0], cols[1]);
        }
    }, progressLabel);

    console.log(`   name.basics: ${scanned.toLocaleString()} rows scanned, ${map.size.toLocaleString()} names kept`);
    return map;
}

/**
 * Parse title.principals.tsv.gz → Map<tconst, nconst[]>
 * Keeps only actors/actresses (category = "actor" or "actress"),
 * limited to the top 5 per title by ordering.
 *
 * Columns (6):
 *   tconst | ordering | nconst | category | job | characters
 */
export async function parseTitlePrincipals(
    imdbDir: string,
    relevantTconsts: Set<string>,
    maxCastPerTitle: number = 5,
    progressLabel?: string,
): Promise<Map<string, string[]>> {
    const filePath = path.join(imdbDir, 'title.principals.tsv.gz');
    const map = new Map<string, string[]>();
    let scanned = 0;

    await processGzipTsv(filePath, (cols) => {
        scanned++;
        const tconst = cols[0];

        // Skip titles we don't care about (saves memory)
        if (!relevantTconsts.has(tconst)) return;

        const category = cols[3];
        if (category !== 'actor' && category !== 'actress') return;

        const nconst = cols[2];
        const existing = map.get(tconst);
        if (!existing) {
            map.set(tconst, [nconst]);
        } else if (existing.length < maxCastPerTitle) {
            existing.push(nconst);
        }
    }, progressLabel);

    console.log(`   title.principals: ${scanned.toLocaleString()} rows scanned, cast for ${map.size.toLocaleString()} titles`);
    return map;
}

// ── Aggregated loader ────────────────────────────────────────────────

export interface ImdbDataset {
    titles: Map<string, TitleBasics>;
    ratings: Map<string, TitleRating>;
    names: Map<string, string>;
    cast: Map<string, string[]>;  // tconst → nconst[]
}

export interface LoadOptions {
    /** Load cast data (name.basics + title.principals). Default: false — these are huge files. */
    loadCast?: boolean;
}

/**
 * Load IMDB datasets needed for enrichment.
 * By default only loads title.basics + title.ratings (fast, ~30s).
 * With loadCast:true also loads name.basics (15M rows) + title.principals (98M rows).
 */
export async function loadImdbDatasets(imdbDir: string, options: LoadOptions = {}): Promise<ImdbDataset> {
    console.log(`📦 Loading IMDB datasets from ${imdbDir}`);

    const titles = await parseTitleBasics(imdbDir, '  📥 title.basics');
    const ratings = await parseTitleRatings(imdbDir, '  📥 title.ratings');

    let names = new Map<string, string>();
    let cast = new Map<string, string[]>();

    if (options.loadCast) {
        const namesPath = path.join(imdbDir, 'name.basics.tsv.gz');
        const principalsPath = path.join(imdbDir, 'title.principals.tsv.gz');

        if (existsSync(namesPath) && existsSync(principalsPath)) {
            const relevantTconsts = new Set(titles.keys());
            cast = await parseTitlePrincipals(imdbDir, relevantTconsts, 5, '  📥 title.principals');
            // Only load names that appear in cast to save memory
            const neededNconsts = new Set<string>();
            for (const nconsts of cast.values()) {
                for (const nc of nconsts) neededNconsts.add(nc);
            }
            names = await parseNameBasicsFiltered(imdbDir, neededNconsts, '  📥 name.basics');
        } else {
            console.log(`   ⚠ Missing name.basics or title.principals — skipping cast data`);
        }
    }

    console.log(`✓ IMDB data loaded: ${titles.size.toLocaleString()} titles, ${ratings.size.toLocaleString()} ratings, ${names.size.toLocaleString()} names`);

    return { titles, ratings, names, cast };
}

/**
 * Load cast data for a specific set of matched title IDs.
 * Much faster than loading all cast data upfront since it filters
 * title.principals to only the tconsts we actually matched.
 */
export async function loadCastForTitles(
    imdbDir: string,
    matchedTconsts: Set<string>,
): Promise<{ names: Map<string, string>; cast: Map<string, string[]> }> {
    const namesPath = path.join(imdbDir, 'name.basics.tsv.gz');
    const principalsPath = path.join(imdbDir, 'title.principals.tsv.gz');

    if (!existsSync(namesPath) || !existsSync(principalsPath)) {
        console.log(`   ⚠ Missing name.basics or title.principals — skipping cast data`);
        return { names: new Map(), cast: new Map() };
    }

    console.log(`📦 Loading cast data for ${matchedTconsts.size.toLocaleString()} matched titles...`);
    const cast = await parseTitlePrincipals(imdbDir, matchedTconsts, 5, '  📥 title.principals');

    const neededNconsts = new Set<string>();
    for (const nconsts of cast.values()) {
        for (const nc of nconsts) neededNconsts.add(nc);
    }
    console.log(`   Need ${neededNconsts.size.toLocaleString()} person names`);
    const names = await parseNameBasicsFiltered(imdbDir, neededNconsts, '  📥 name.basics');

    return { names, cast };
}

/**
 * Resolve nconst list to human names using the names map.
 */
export function resolveNames(nconsts: string[], names: Map<string, string>): string[] {
    return nconsts
        .map(nc => names.get(nc))
        .filter((name): name is string => name !== undefined && name !== NULL_MARKER);
}

/**
 * Check if a value is the IMDB null marker '\N'.
 */
export function isImdbNull(value: string): boolean {
    return value === NULL_MARKER;
}
