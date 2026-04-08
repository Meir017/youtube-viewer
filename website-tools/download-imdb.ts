#!/usr/bin/env bun
/**
 * IMDB Non-Commercial Datasets Downloader
 *
 * Downloads dataset files from https://datasets.imdbws.com/ using
 * native fetch into a local directory for offline enrichment of
 * movie / TV-series video descriptions.
 *
 * Usage:
 *   bun run website-tools/download-imdb.ts [options]
 *
 * Options:
 *   --output=<dir>      Download directory (default: data/imdb)
 *   --datasets=<list>   Comma-separated dataset names to download
 *                        (default: all). Example: --datasets=title.basics,title.ratings
 *   --skip-existing     Skip files that already exist on disk
 *   --decompress        Decompress .tsv.gz files after download
 *   --help, -h          Show this help message
 *
 * Verified dataset schemas (from https://datasets.imdbws.com/):
 *
 *   name.basics.tsv.gz       ~287 MB  ~15.2M rows  6 cols
 *     nconst | primaryName | birthYear | deathYear | primaryProfession | knownForTitles
 *
 *   title.akas.tsv.gz        ~463 MB  ~55.9M rows  8 cols
 *     titleId | ordering | title | region | language | types | attributes | isOriginalTitle
 *
 *   title.basics.tsv.gz      ~210 MB  ~12.4M rows  9 cols
 *     tconst | titleType | primaryTitle | originalTitle | isAdult | startYear | endYear | runtimeMinutes | genres
 *     titleType values: tvEpisode, short, movie, video, tvSeries, tvMovie, tvMiniSeries, tvSpecial, videoGame, tvShort, tvPilot
 *
 *   title.crew.tsv.gz         ~77 MB  ~12.4M rows  3 cols
 *     tconst | directors | writers
 *     (directors/writers are comma-separated nconst lists)
 *
 *   title.episode.tsv.gz      ~51 MB   ~9.6M rows  4 cols
 *     tconst | parentTconst | seasonNumber | episodeNumber
 *
 *   title.principals.tsv.gz  ~725 MB  ~98.8M rows  6 cols
 *     tconst | ordering | nconst | category | job | characters
 *     (characters is a JSON array string, e.g. '["Self"]')
 *
 *   title.ratings.tsv.gz       ~8 MB   ~1.7M rows  3 cols
 *     tconst | averageRating | numVotes
 *
 * All files are gzipped, tab-separated UTF-8. First line is always headers.
 * Null/missing values are represented as the literal string '\N'.
 */

import path from 'path';
import { mkdir } from 'fs/promises';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { Readable } from 'stream';

// ── Colours ──────────────────────────────────────────────────────────
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};

const IMDB_BASE_URL = 'https://datasets.imdbws.com';

// The 7 dataset files served at https://datasets.imdbws.com/
const KNOWN_DATASETS = [
    'name.basics.tsv.gz',
    'title.akas.tsv.gz',
    'title.basics.tsv.gz',
    'title.crew.tsv.gz',
    'title.episode.tsv.gz',
    'title.principals.tsv.gz',
    'title.ratings.tsv.gz',
] as const;

// ── CLI args ─────────────────────────────────────────────────────────
interface CliArgs {
    outputDir: string;
    datasets: string[] | null;
    skipExisting: boolean;
    decompress: boolean;
}

function parseArgs(): CliArgs {
    const args = process.argv.slice(2);
    let outputDir = path.join(import.meta.dir, '..', 'data', 'imdb');
    let datasets: string[] | null = null;
    let skipExisting = false;
    let decompress = false;

    for (const arg of args) {
        if (arg.startsWith('--output=')) {
            outputDir = path.resolve(arg.split('=')[1]);
        } else if (arg.startsWith('--datasets=')) {
            datasets = arg.split('=')[1].split(',').map(d => d.trim());
        } else if (arg === '--skip-existing') {
            skipExisting = true;
        } else if (arg === '--decompress') {
            decompress = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
${c.bold}IMDB Non-Commercial Datasets Downloader${c.reset}

${c.dim}Downloads IMDB TSV dataset files for offline
movie / TV-series enrichment.${c.reset}

${c.bold}Usage:${c.reset}
  bun run website-tools/download-imdb.ts [options]

${c.bold}Options:${c.reset}
  --output=<dir>      Download directory (default: data/imdb)
  --datasets=<list>   Comma-separated names (default: all)
                       e.g. --datasets=title.basics,title.ratings
  --skip-existing     Skip files already present on disk
  --decompress        Decompress .tsv.gz → .tsv after download
  --help, -h          Show this help message

${c.bold}Available datasets (7 files, ~1.8 GB total compressed):${c.reset}
  name.basics.tsv.gz        ~287 MB   Person info
  title.akas.tsv.gz         ~463 MB   Alternative titles
  title.basics.tsv.gz       ~210 MB   Title type, name, year, runtime, genres
  title.crew.tsv.gz          ~77 MB   Directors & writers per title
  title.episode.tsv.gz       ~51 MB   TV episode ↔ series mapping
  title.principals.tsv.gz   ~725 MB   Principal cast & crew per title
  title.ratings.tsv.gz        ~8 MB   Average rating & vote count

${c.bold}For movie enrichment, the most useful are:${c.reset}
  --datasets=title.basics,title.ratings,title.principals,name.basics
`);
            process.exit(0);
        }
    }

    return { outputDir, datasets, skipExisting, decompress };
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

async function decompressGzip(gzPath: string): Promise<string> {
    const tsvPath = gzPath.replace(/\.gz$/, '');
    await pipeline(
        createReadStream(gzPath),
        createGunzip(),
        createWriteStream(tsvPath),
    );
    return tsvPath;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const { outputDir, datasets, skipExisting, decompress } = parseArgs();

    console.log();
    console.log(`${c.bold}${c.cyan}╔════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bold}${c.cyan}║            IMDB Dataset Downloader                     ║${c.reset}`);
    console.log(`${c.bold}${c.cyan}╚════════════════════════════════════════════════════════╝${c.reset}`);
    console.log();

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });
    console.log(`${c.dim}📂 Output directory:${c.reset} ${outputDir}`);
    console.log();

    // Filter datasets if --datasets was specified.
    // Match by prefix so "--datasets=title.basics" matches "title.basics.tsv.gz".
    const toDownload = datasets
        ? KNOWN_DATASETS.filter(name => datasets.some(d => name.startsWith(d)))
        : [...KNOWN_DATASETS];

    if (toDownload.length === 0) {
        console.error(`${c.red}❌ No datasets matched the filter: ${datasets?.join(', ')}${c.reset}`);
        console.error(`${c.dim}   Available: ${KNOWN_DATASETS.join(', ')}${c.reset}`);
        process.exit(1);
    }

    if (datasets) {
        console.log(`${c.yellow}🔍 Filtered to ${toDownload.length} dataset(s):${c.reset} ${toDownload.join(', ')}`);
        console.log();
    }

    // Download each dataset via fetch
    let downloaded = 0;
    let skipped = 0;
    let totalBytes = 0;
    const startTime = Date.now();

    for (const fileName of toDownload) {
        const destPath = path.join(outputDir, fileName);
        const url = `${IMDB_BASE_URL}/${fileName}`;

        // Skip existing?
        if (skipExisting && existsSync(destPath)) {
            console.log(`${c.yellow}⏭  Skipping${c.reset} ${fileName} ${c.dim}(already exists)${c.reset}`);
            skipped++;
            continue;
        }

        console.log(`${c.blue}⬇  Downloading${c.reset} ${c.bold}${fileName}${c.reset} ...`);
        const dlStart = Date.now();

        const response = await fetch(url);
        if (!response.ok) {
            console.error(`   ${c.red}✗ HTTP ${response.status} ${response.statusText}${c.reset}`);
            continue;
        }

        // Stream response body to disk
        const body = response.body;
        if (!body) {
            console.error(`   ${c.red}✗ Empty response body${c.reset}`);
            continue;
        }

        const nodeStream = Readable.fromWeb(body as any);
        await pipeline(nodeStream, createWriteStream(destPath));

        const dlTime = Date.now() - dlStart;
        const size = Bun.file(destPath).size;
        totalBytes += size;

        console.log(
            `   ${c.green}✓${c.reset} ${formatBytes(size)} in ${formatDuration(dlTime)}`,
        );

        // Optionally decompress
        if (decompress) {
            console.log(`   ${c.dim}📦 Decompressing...${c.reset}`);
            const tsvPath = await decompressGzip(destPath);
            const tsvSize = Bun.file(tsvPath).size;
            console.log(
                `   ${c.green}✓${c.reset} ${path.basename(tsvPath)} ${c.dim}(${formatBytes(tsvSize)})${c.reset}`,
            );
        }

        downloaded++;
    }

    const totalTime = Date.now() - startTime;

    // Summary
    console.log();
    console.log(`${c.bold}════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}📊 Download Complete${c.reset}`);
    console.log();
    console.log(`   ${c.green}✅ Downloaded:${c.reset}  ${downloaded} file(s)`);
    if (skipped > 0) {
        console.log(`   ${c.yellow}⏭  Skipped:${c.reset}     ${skipped} file(s)`);
    }
    console.log(`   ${c.blue}📦 Total size:${c.reset}  ${formatBytes(totalBytes)}`);
    console.log(`   ${c.blue}⏱  Duration:${c.reset}   ${formatDuration(totalTime)}`);
    console.log(`   ${c.dim}📂 Location:${c.reset}   ${outputDir}`);
    console.log(`${c.bold}════════════════════════════════════════════════════════${c.reset}`);
    console.log();

    if (decompress) {
        console.log(`${c.dim}💡 Decompressed .tsv files are ready for processing.${c.reset}`);
    } else {
        console.log(`${c.dim}💡 Re-run with --decompress to unpack .tsv.gz files.${c.reset}`);
    }
    console.log(
        `${c.dim}💡 For movie enrichment, the most useful datasets are:${c.reset}`,
    );
    console.log(
        `${c.dim}   title.basics  (title, year, runtime, genres — 9 cols, ~12.4M rows)${c.reset}`,
    );
    console.log(
        `${c.dim}   title.ratings (averageRating, numVotes — 3 cols, ~1.7M rows)${c.reset}`,
    );
    console.log(
        `${c.dim}   name.basics   (actor/director names — 6 cols, ~15.2M rows)${c.reset}`,
    );
}

main().catch(err => {
    console.error(`${c.red}Fatal error:${c.reset}`, err);
    process.exit(1);
});
