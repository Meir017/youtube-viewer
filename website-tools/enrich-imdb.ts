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
  --force             Re-match videos that already have IMDB data
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

    return { collectionId, imdbDir, minRating, dryRun, force, limit, withCast };
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
    const { collectionId, imdbDir, minRating, dryRun, force, limit, withCast } = parseArgs();

    console.log();
    console.log(`${c.bold}${c.cyan}╔════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bold}${c.cyan}║             IMDB Enrichment Tool                       ║${c.reset}`);
    console.log(`${c.bold}${c.cyan}╚════════════════════════════════════════════════════════╝${c.reset}`);
    console.log();

    // Validate IMDB datasets exist
    const requiredFiles = ['title.basics.tsv.gz', 'title.ratings.tsv.gz'];
    const optionalFiles = ['name.basics.tsv.gz', 'title.principals.tsv.gz'];

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
    const dataset = await loadImdbDatasets(imdbDir);
    const loadTime = Date.now() - loadStart;
    console.log(`${c.dim}   Loaded in ${formatDuration(loadTime)}${c.reset}`);
    console.log();

    // Build title index
    console.log(`${c.dim}🔍 Building title index...${c.reset}`);
    const indexStart = Date.now();
    const index = new ImdbTitleIndex(dataset);
    console.log(`${c.dim}   Index built in ${formatDuration(Date.now() - indexStart)}${c.reset}`);
    console.log();

    // Load channels.json
    console.log(`${c.dim}📂 Loading channels database...${c.reset}`);
    const dataFile = Bun.file(DATA_FILE);
    if (!(await dataFile.exists())) {
        console.error(`${c.red}❌ Database not found: ${DATA_FILE}${c.reset}`);
        process.exit(1);
    }
    const data: ChannelsData = await dataFile.json();

    // Collect videos to process
    let matched = 0;
    let unmatched = 0;
    let skipped = 0;
    let filtered = 0;
    let processed = 0;
    const matchStart = Date.now();

    // Phase 1: Match titles (fast — only uses basics + ratings)
    interface PendingMatch {
        video: Video;
        match: MatchResult;
    }
    const pendingMatches: PendingMatch[] = [];

    for (const collection of data.collections) {
        if (collectionId && collection.id !== collectionId) continue;

        console.log(`${c.bold}${c.magenta}📁 ${collection.name}${c.reset} ${c.dim}(${collection.channels.length} channels)${c.reset}`);

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

                const match = index.match(video.title);
                if (!match) {
                    unmatched++;
                    continue;
                }

                // Apply min-rating filter
                if (minRating > 0 && match.rating) {
                    const rating = parseFloat(match.rating.averageRating);
                    if (rating < minRating) {
                        filtered++;
                        continue;
                    }
                }

                pendingMatches.push({ video, match });
                matched++;
                channelMatched++;

                if (dryRun && channelMatched <= 3) {
                    const r = match.rating ? `${match.rating.averageRating}/10` : '-';
                    console.log(`     ${c.green}✓${c.reset} ${truncate(video.title, 45)} → ${c.bold}${match.title.primaryTitle}${c.reset} (${match.title.startYear}) ${r} [${match.confidence}]`);
                }
            }

            if (limit && processed >= limit) break;

            if (channelTotal > 0) {
                const pct = channelTotal > 0 ? ((channelMatched / channelTotal) * 100).toFixed(0) : '0';
                console.log(`   ${c.dim}${channel.handle}${c.reset}: ${channelMatched}/${channelTotal} matched (${pct}%)`);
            }
        }

        if (limit && processed >= limit) {
            console.log(`${c.yellow}   ⚠ Reached --limit=${limit}${c.reset}`);
            break;
        }
    }

    // Phase 2: Load cast data for matched titles (optional, slow)
    if (withCast && pendingMatches.length > 0) {
        const matchedTconsts = new Set(pendingMatches.map(m => m.match.tconst));
        const castData = await loadCastForTitles(imdbDir, matchedTconsts);
        dataset.names = castData.names;
        dataset.cast = castData.cast;
    }

    // Phase 3: Write IMDB data onto Video objects
    if (!dryRun) {
        for (const { video, match } of pendingMatches) {
            // Re-resolve cast names now that cast data is loaded
            if (withCast) {
                const castNconsts = dataset.cast.get(match.tconst) || [];
                match.castNames = resolveNames(castNconsts, dataset.names);
            }
            video.imdb = matchToImdbData(match);
        }
    }

    // Save
    if (!dryRun && pendingMatches.length > 0) {
        console.log();
        console.log(`${c.dim}💾 Saving...${c.reset}`);
        await Bun.write(DATA_FILE, JSON.stringify(data, null, 2));
    }

    const totalTime = Date.now() - matchStart;

    // Summary
    console.log();
    console.log(`${c.bold}════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}📊 Enrichment ${dryRun ? '(Dry Run) ' : ''}Complete${c.reset}`);
    console.log();
    console.log(`   ${c.green}✅ Matched:${c.reset}     ${matched}`);
    console.log(`   ${c.red}✗  Unmatched:${c.reset}   ${unmatched}`);
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
