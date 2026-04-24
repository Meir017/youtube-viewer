#!/usr/bin/env bun
/**
 * IMDB enrichment tool for the website database
 *
 * Matches YouTube video titles against IMDB datasets and writes
 * structured metadata (rating, genres, cast, year, runtime) onto
 * Video objects in channels.json.
 *
 * Usage:
 *   bun run website-tools/enrich-imdb.ts [options]
 *
 * Options:
 *   --collection=<id>   Only enrich a specific collection (default: all)
 *   --imdb-dir=<dir>    Path to IMDB dataset files (default: data/imdb)
 *   --min-rating=<n>    Only keep matches with rating >= n (default: 0)
 *   --dry-run           Show matches without writing changes
 *   --force             Re-match videos that already have IMDB data
 *   --limit=<n>         Max videos to process (default: unlimited)
 *   --help, -h          Show this help message
 *
 * Requires IMDB datasets downloaded via:
 *   bun run tools:download-imdb -- --datasets=title.basics,title.ratings,name.basics,title.principals
 */

import path from 'path';
import { existsSync } from 'fs';
import { loadImdbDatasets, loadCastForTitles, resolveNames } from './imdb-parser';
import { ImdbTitleIndex, matchToImdbData, type MatchResult } from './imdb-matcher';
import { loadDescriptions, type VideoDescriptions } from '../website/descriptions-store';
import { createProgress } from './progress';
import type { Video } from '../generator/types';

// ── Colours ──────────────────────────────────────────────────────────
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
};

// ── Types matching website store structure ────────────────────────────
interface StoredChannel {
    id: string;
    handle: string;
    addedAt: string;
    data?: {
        channel: any;
        videos: Video[];
    };
    lastUpdated?: string;
}

interface Collection {
    id: string;
    name: string;
    channels: StoredChannel[];
    createdAt?: string;
}

interface ChannelsData {
    collections: Collection[];
}

// ── CLI args ─────────────────────────────────────────────────────────
interface CliArgs {
    collectionId: string | null;
    imdbDir: string;
    minRating: number;
    dryRun: boolean;
    force: boolean;
    clean: boolean;
    cleanOnly: boolean;
    limit: number | null;
    withCast: boolean;
}

const DATA_FILE = path.join(import.meta.dir, '..', 'website', 'data', 'channels.json');

function parseArgs(): CliArgs {
    const args = process.argv.slice(2);
    let collectionId: string | null = null;
    let imdbDir = path.join(import.meta.dir, '..', 'data', 'imdb');
    let minRating = 0;
    let dryRun = false;
    let force = false;
    let clean = false;
    let cleanOnly = false;
    let limit: number | null = null;
    let withCast = false;

    for (const arg of args) {
        if (arg.startsWith('--collection=')) {
            collectionId = arg.split('=')[1];
        } else if (arg.startsWith('--imdb-dir=')) {
            imdbDir = path.resolve(arg.split('=')[1]);
        } else if (arg.startsWith('--min-rating=')) {
            minRating = parseFloat(arg.split('=')[1]);
        } else if (arg === '--dry-run') {
            dryRun = true;
        } else if (arg === '--force') {
            force = true;
        } else if (arg === '--clean') {
            clean = true;
        } else if (arg === '--clean-only') {
            cleanOnly = true;
        } else if (arg === '--with-cast') {
            withCast = true;
        } else if (arg.startsWith('--limit=')) {
            limit = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
${c.bold}IMDB Enrichment Tool${c.reset}

${c.dim}Matches YouTube video titles against IMDB datasets and writes
structured metadata onto Video objects in channels.json.${c.reset}

${c.bold}Usage:${c.reset}
  bun run website-tools/enrich-imdb.ts [options]

${c.bold}Options:${c.reset}
  --collection=<id>   Only enrich a specific collection (default: all)
  --imdb-dir=<dir>    Path to IMDB datasets (default: data/imdb)
  --min-rating=<n>    Only keep matches with rating >= n (default: 0)
  --dry-run           Show matches without writing changes
  --force             Re-match videos that already have IMDB data (implies --clean)
  --clean             Strip existing imdb fields on in-scope videos before matching
                      (so unmatched videos lose stale data)
  --clean-only        Only strip existing imdb fields, do not match or load IMDB datasets.
                      Fastest way to wipe enrichment data.
  --with-cast         Also load cast data (slow — parses 100M+ rows)
  --limit=<n>         Max videos to process (default: unlimited)
  --help, -h          Show this help message

${c.bold}Required datasets:${c.reset}
  Download first with:
  bun run tools:download-imdb -- --datasets=title.basics,title.ratings,name.basics,title.principals
`);
            process.exit(0);
        }
    }

    // --force naturally means "redo everything from scratch", which includes
    // dropping stale imdb data that no longer matches this run.
    if (force) clean = true;
    // --clean-only is a clean operation by definition.
    if (cleanOnly) clean = true;

    return { collectionId, imdbDir, minRating, dryRun, force, clean, cleanOnly, limit, withCast };
}

// ── Helpers ──────────────────────────────────────────────────────────

function truncate(s: string, len: number): string {
    return s.length <= len ? s : s.substring(0, len - 1) + '…';
}

function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const { collectionId, imdbDir, minRating, dryRun, force, clean, cleanOnly, limit, withCast } = parseArgs();

    console.log();
    console.log(`${c.bold}${c.cyan}╔════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bold}${c.cyan}║             IMDB Enrichment Tool                       ║${c.reset}`);
    console.log(`${c.bold}${c.cyan}╚════════════════════════════════════════════════════════╝${c.reset}`);
    if (cleanOnly) {
        console.log(`${c.yellow}   Mode: clean-only (IMDB datasets will not be loaded)${c.reset}`);
    }
    console.log();

    // Datasets, index, and descriptions are only needed for the matching
    // phase — skip all of that when the user just wants to wipe enrichment.
    let dataset: Awaited<ReturnType<typeof loadImdbDatasets>> | null = null;
    let index: ImdbTitleIndex | null = null;
    let descriptions: VideoDescriptions = {};

    if (!cleanOnly) {
        // Validate IMDB datasets exist
        const requiredFiles = ['title.basics.tsv.gz', 'title.ratings.tsv.gz'];
        for (const file of requiredFiles) {
            if (!existsSync(path.join(imdbDir, file))) {
                console.error(`${c.red}❌ Missing required dataset: ${file}${c.reset}`);
                console.error(`${c.dim}   Run: bun run tools:download-imdb -- --datasets=title.basics,title.ratings,name.basics,title.principals${c.reset}`);
                process.exit(1);
            }
        }

        const hasNames = existsSync(path.join(imdbDir, 'name.basics.tsv.gz'));
        const hasPrincipals = existsSync(path.join(imdbDir, 'title.principals.tsv.gz'));

        if (!hasNames || !hasPrincipals) {
            console.log(`${c.yellow}⚠  Missing optional datasets (name.basics / title.principals) — cast data will be unavailable${c.reset}`);
        }

        // Load IMDB datasets (fast: basics + ratings only)
        const loadStart = Date.now();
        dataset = await loadImdbDatasets(imdbDir);
        const loadTime = Date.now() - loadStart;
        console.log(`${c.dim}   Loaded in ${formatDuration(loadTime)}${c.reset}`);
        console.log();

        // Build title index
        console.log(`${c.dim}🔍 Building title index...${c.reset}`);
        const indexStart = Date.now();
        index = new ImdbTitleIndex(dataset);
        console.log(`${c.dim}   Index built in ${formatDuration(Date.now() - indexStart)}${c.reset}`);
        console.log();

        // Load descriptions (used as a fallback signal when title-based matching fails)
        console.log(`${c.dim}📂 Loading descriptions store...${c.reset}`);
        descriptions = await loadDescriptions();
        const descCount = Object.keys(descriptions).length;
        console.log(`${c.dim}   ${descCount.toLocaleString()} descriptions loaded${c.reset}`);
        console.log();
    }

    // Load channels.json
    console.log(`${c.dim}📂 Loading channels database...${c.reset}`);
    const dataFile = Bun.file(DATA_FILE);
    if (!(await dataFile.exists())) {
        console.error(`${c.red}❌ Database not found: ${DATA_FILE}${c.reset}`);
        process.exit(1);
    }
    const data: ChannelsData = await dataFile.json();
    const dbSizeMb = (dataFile.size / (1024 * 1024)).toFixed(1);
    console.log(`${c.dim}   ${dbSizeMb} MB, ${data.collections.length} collection(s)${c.reset}`);
    console.log();

    // Clean phase: strip existing `imdb` fields from in-scope videos so that
    // (a) videos that no longer match this run lose stale data, and
    // (b) the rest of the pipeline treats every eligible video as fresh.
    // Mutates in memory only; the save at the end is what persists the change.
    let cleared = 0;
    if (clean) {
        const cleanProgress = createProgress(`${c.yellow}🧹 Clearing existing IMDB data${c.reset}`);
        let visited = 0;
        for (const collection of data.collections) {
            if (collectionId && collection.id !== collectionId) continue;
            for (const channel of collection.channels) {
                const videos = channel.data?.videos || [];
                for (const video of videos) {
                    visited++;
                    if (video.imdb) {
                        delete video.imdb;
                        cleared++;
                    }
                    cleanProgress.tick(visited, `${c.yellow}${cleared.toLocaleString()} cleared${c.reset}`);
                }
            }
        }
        cleanProgress.done(`${c.yellow}🧹 Cleared ${cleared.toLocaleString()} existing IMDB entries${c.reset} ${c.dim}(${visited.toLocaleString()} videos visited)${c.reset}`);
        console.log();
    }

    // Clean-only mode: save the stripped data and exit without touching IMDB.
    if (cleanOnly) {
        if (!dryRun && cleared > 0) {
            const saveStart = Date.now();
            process.stdout.write(`${c.dim}💾 Saving ${DATA_FILE}...${c.reset}`);
            await Bun.write(DATA_FILE, JSON.stringify(data, null, 2));
            const savedSize = Bun.file(DATA_FILE).size;
            console.log(` ${c.green}done${c.reset} ${c.dim}(${(savedSize / (1024 * 1024)).toFixed(1)} MB in ${formatDuration(Date.now() - saveStart)})${c.reset}`);
        } else if (dryRun) {
            console.log(`${c.dim}(dry-run — no changes written)${c.reset}`);
        } else {
            console.log(`${c.dim}Nothing to clear — no videos had imdb data${c.reset}`);
        }
        console.log();
        console.log(`${c.bold}════════════════════════════════════════════════════════${c.reset}`);
        console.log(`${c.bold}📊 Clean ${dryRun ? '(Dry Run) ' : ''}Complete${c.reset}`);
        console.log();
        console.log(`   ${c.yellow}🧹 Cleared:${c.reset}     ${cleared}`);
        console.log(`${c.bold}════════════════════════════════════════════════════════${c.reset}`);
        return;
    }

    // From here on the matching pipeline needs the loaded datasets.
    if (!dataset || !index) {
        // This shouldn't happen — defensive check for the type narrower.
        throw new Error('Internal error: dataset/index not loaded');
    }

    // Pre-count eligible videos so the progress bar has a meaningful total.
    // Mirrors the filter logic in the main loop exactly.
    let eligibleTotal = 0;
    for (const collection of data.collections) {
        if (collectionId && collection.id !== collectionId) continue;
        for (const channel of collection.channels) {
            const videos = channel.data?.videos || [];
            for (const video of videos) {
                if (video.isShort) continue;
                if (!video.title) continue;
                if (video.imdb && !force) continue;
                eligibleTotal++;
                if (limit && eligibleTotal >= limit) break;
            }
            if (limit && eligibleTotal >= limit) break;
        }
        if (limit && eligibleTotal >= limit) break;
    }
    console.log(`${c.bold}🎯 ${eligibleTotal.toLocaleString()} videos eligible for matching${c.reset}`);
    console.log();

    // Collect videos to process
    let matched = 0;
    let unmatched = 0;
    let skipped = 0;
    let filtered = 0;
    let processed = 0;
    const matchStart = Date.now();
    const channelSummaries: string[] = [];
    const progress = createProgress(`${c.cyan}🔎 Matching${c.reset}`, { total: eligibleTotal });

    // Phase 1: Match titles (fast — only uses basics + ratings)
    interface PendingMatch {
        video: Video;
        match: MatchResult;
    }
    const pendingMatches: PendingMatch[] = [];

    for (const collection of data.collections) {
        if (collectionId && collection.id !== collectionId) continue;

        channelSummaries.push(`${c.bold}${c.magenta}📁 ${collection.name}${c.reset} ${c.dim}(${collection.channels.length} channels)${c.reset}`);

        for (const channel of collection.channels) {
            const videos = channel.data?.videos || [];
            let channelMatched = 0;
            let channelTotal = 0;

            for (const video of videos) {
                if (video.isShort) continue;
                if (!video.title) continue;

                // Skip already-enriched unless --force
                if (video.imdb && !force) {
                    skipped++;
                    continue;
                }

                if (limit && processed >= limit) break;
                processed++;
                channelTotal++;

                const match = index.match(video.title, null, descriptions[video.videoId] ?? null);
                if (!match) {
                    unmatched++;
                    progress.tick(processed, `${c.green}✓${matched}${c.reset} ${c.red}✗${unmatched}${c.reset}`);
                    continue;
                }

                // Apply min-rating filter
                if (minRating > 0 && match.rating) {
                    const rating = parseFloat(match.rating.averageRating);
                    if (rating < minRating) {
                        filtered++;
                        progress.tick(processed, `${c.green}✓${matched}${c.reset} ${c.red}✗${unmatched}${c.reset}`);
                        continue;
                    }
                }

                pendingMatches.push({ video, match });
                matched++;
                channelMatched++;
                progress.tick(processed, `${c.green}✓${matched}${c.reset} ${c.red}✗${unmatched}${c.reset}`);

                if (dryRun && channelMatched <= 3) {
                    const r = match.rating ? `${match.rating.averageRating}/10` : '-';
                    channelSummaries.push(`     ${c.green}✓${c.reset} ${truncate(video.title, 45)} → ${c.bold}${match.title.primaryTitle}${c.reset} (${match.title.startYear}) ${r} [${match.confidence}]`);
                }
            }

            if (limit && processed >= limit) break;

            if (channelTotal > 0) {
                const pct = channelTotal > 0 ? ((channelMatched / channelTotal) * 100).toFixed(0) : '0';
                channelSummaries.push(`   ${c.dim}${channel.handle}${c.reset}: ${channelMatched}/${channelTotal} matched (${pct}%)`);
            }
        }

        if (limit && processed >= limit) {
            channelSummaries.push(`${c.yellow}   ⚠ Reached --limit=${limit}${c.reset}`);
            break;
        }
    }

    progress.done(`${c.cyan}🔎 Matching complete${c.reset} · ${processed.toLocaleString()} videos · ${c.green}✓${matched}${c.reset} ${c.red}✗${unmatched}${c.reset} · ${formatDuration(Date.now() - matchStart)}`);
    console.log();
    // Flush per-channel summaries after the progress bar so the terminal
    // doesn't have to fight the \r rewriter mid-run.
    for (const line of channelSummaries) console.log(line);

    // Phase 2: Load cast data for matched titles (optional, slow)
    if (withCast && pendingMatches.length > 0) {
        const matchedTconsts = new Set(pendingMatches.map(m => m.match.tconst));
        const castData = await loadCastForTitles(imdbDir, matchedTconsts);
        dataset.names = castData.names;
        dataset.cast = castData.cast;
    }

    // Phase 3: Write IMDB data onto Video objects
    if (!dryRun && pendingMatches.length > 0) {
        console.log();
        const writeProgress = createProgress(`${c.cyan}✍  Applying matches${c.reset}`, { total: pendingMatches.length });
        let writeCount = 0;
        for (const { video, match } of pendingMatches) {
            // Re-resolve cast names now that cast data is loaded
            if (withCast) {
                const castNconsts = dataset.cast.get(match.tconst) || [];
                match.castNames = resolveNames(castNconsts, dataset.names);
            }
            video.imdb = matchToImdbData(match);
            writeCount++;
            writeProgress.tick(writeCount);
        }
        writeProgress.done(`${c.cyan}✍  Applied ${writeCount.toLocaleString()} matches${c.reset}`);
    }

    // Save
    const shouldSave = !dryRun && (pendingMatches.length > 0 || cleared > 0);
    if (shouldSave) {
        console.log();
        const saveStart = Date.now();
        process.stdout.write(`${c.dim}💾 Saving ${DATA_FILE}...${c.reset}`);
        await Bun.write(DATA_FILE, JSON.stringify(data, null, 2));
        const savedSize = Bun.file(DATA_FILE).size;
        console.log(` ${c.green}done${c.reset} ${c.dim}(${(savedSize / (1024 * 1024)).toFixed(1)} MB in ${formatDuration(Date.now() - saveStart)})${c.reset}`);
    }

    const totalTime = Date.now() - matchStart;

    // Summary
    console.log();
    console.log(`${c.bold}════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}📊 Enrichment ${dryRun ? '(Dry Run) ' : ''}Complete${c.reset}`);
    console.log();
    console.log(`   ${c.green}✅ Matched:${c.reset}     ${matched}`);
    console.log(`   ${c.red}✗  Unmatched:${c.reset}   ${unmatched}`);
    if (cleared > 0) {
        console.log(`   ${c.yellow}🧹 Cleared:${c.reset}     ${cleared} ${c.dim}(existing imdb entries dropped before matching)${c.reset}`);
    }
    if (skipped > 0) {
        console.log(`   ${c.yellow}⏭  Skipped:${c.reset}     ${skipped} ${c.dim}(already enriched)${c.reset}`);
    }
    if (filtered > 0) {
        console.log(`   ${c.yellow}🔽 Filtered:${c.reset}    ${filtered} ${c.dim}(below min-rating ${minRating})${c.reset}`);
    }
    const total = matched + unmatched;
    if (total > 0) {
        console.log(`   ${c.dim}   Match rate: ${((matched / total) * 100).toFixed(1)}%${c.reset}`);
    }
    console.log(`   ${c.blue}⏱  Duration:${c.reset}   ${formatDuration(totalTime)}`);
    console.log(`${c.bold}════════════════════════════════════════════════════════${c.reset}`);
}

main().catch(err => {
    console.error(`${c.red}Fatal error:${c.reset}`, err);
    process.exit(1);
});
