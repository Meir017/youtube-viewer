#!/usr/bin/env bun
/**
 * Static website build tool
 * 
 * Assembles a self-contained static website from static-website/ source files
 * and the channels.json data file.
 * 
 * Usage:
 *   bun run website-tools/build-static.ts [options]
 * 
 * Options:
 *   --output=<dir>   Output directory (default: dist/static)
 *   --help, -h       Show this help message
 */

import { join, resolve, relative } from 'path';

// ANSI color codes
const colors = {
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

// Format file size
function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Parse CLI arguments
function parseArgs(): {
    outputDir: string;
} {
    const args = process.argv.slice(2);
    let outputDir = 'dist/static';

    for (const arg of args) {
        if (arg.startsWith('--output=')) {
            outputDir = arg.split('=')[1];
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Static Website Build Tool

Usage:
  bun run website-tools/build-static.ts [options]

Options:
  --output=<dir>   Output directory (default: dist/static)
  --help, -h       Show this help message

This tool assembles a self-contained static website by copying the static
source files (index.html, app.js, styles.css) and the channels.json data
into a single output directory that can be deployed to any static host.
`);
            process.exit(0);
        }
    }

    return { outputDir };
}

// Source paths
const PROJECT_ROOT = resolve(import.meta.dir, '..');
const STATIC_SRC = join(PROJECT_ROOT, 'static-website');
const DATA_FILE = join(PROJECT_ROOT, 'website', 'data', 'channels.json');

// Files to copy from static-website/
const STATIC_FILES = [
    'index.html',
    'app.js',
    'styles.css',
];

interface CopiedFile {
    name: string;
    size: number;
}

export async function buildStatic(outputDir: string): Promise<CopiedFile[]> {
    const outPath = resolve(PROJECT_ROOT, outputDir);
    const dataOutPath = join(outPath, 'data');

    // Validate channels.json exists
    const dataFile = Bun.file(DATA_FILE);
    if (!(await dataFile.exists())) {
        throw new Error(
            `channels.json not found at ${DATA_FILE}\n` +
            `Run 'bun run web' first to create collections and channels.`
        );
    }

    // Validate static source files exist
    for (const file of STATIC_FILES) {
        const srcPath = join(STATIC_SRC, file);
        const f = Bun.file(srcPath);
        if (!(await f.exists())) {
            throw new Error(`Static source file not found: ${srcPath}`);
        }
    }

    // Ensure output directories exist
    await Bun.write(join(dataOutPath, '.gitkeep'), '');

    const copied: CopiedFile[] = [];

    // Copy static files
    for (const file of STATIC_FILES) {
        const srcPath = join(STATIC_SRC, file);
        const destPath = join(outPath, file);
        const content = await Bun.file(srcPath).arrayBuffer();
        await Bun.write(destPath, content);
        copied.push({ name: file, size: content.byteLength });
    }

    // Copy channels.json
    const dataContent = await dataFile.arrayBuffer();
    const dataDestPath = join(dataOutPath, 'channels.json');
    await Bun.write(dataDestPath, dataContent);
    copied.push({ name: 'data/channels.json', size: dataContent.byteLength });

    // Remove .gitkeep helper
    const gitkeepPath = join(dataOutPath, '.gitkeep');
    const gitkeep = Bun.file(gitkeepPath);
    if (await gitkeep.exists()) {
        const { unlink } = await import('fs/promises');
        await unlink(gitkeepPath);
    }

    return copied;
}

async function main(): Promise<void> {
    const { outputDir } = parseArgs();

    console.log();
    console.log(`${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}║           Static Website Build Tool                    ║${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log();

    const outPath = resolve(PROJECT_ROOT, outputDir);
    console.log(`${colors.dim}📂 Output:${colors.reset} ${relative(PROJECT_ROOT, outPath)}`);
    console.log(`${colors.dim}📂 Source:${colors.reset} static-website/`);
    console.log(`${colors.dim}📂 Data:${colors.reset}   website/data/channels.json`);
    console.log();

    console.log(`${colors.bold}🚀 Building...${colors.reset}`);
    console.log();

    try {
        const copied = await buildStatic(outputDir);

        let totalSize = 0;
        for (const file of copied) {
            totalSize += file.size;
            console.log(`${colors.green}✓${colors.reset} ${colors.dim}${file.name}${colors.reset} ${colors.gray}(${formatSize(file.size)})${colors.reset}`);
        }

        console.log();
        console.log(`${colors.bold}════════════════════════════════════════════════════════${colors.reset}`);
        console.log(`${colors.bold}📊 Build Complete${colors.reset}`);
        console.log();
        console.log(`   ${colors.green}✅ Files:${colors.reset}     ${copied.length}`);
        console.log(`   ${colors.blue}📦 Total size:${colors.reset} ${formatSize(totalSize)}`);
        console.log(`   ${colors.dim}📂 Output:${colors.reset}    ${relative(PROJECT_ROOT, outPath)}/`);
        console.log();
        console.log(`   ${colors.dim}💡 Serve with: bunx serve ${relative(PROJECT_ROOT, outPath)}${colors.reset}`);
        console.log(`${colors.bold}════════════════════════════════════════════════════════${colors.reset}`);
    } catch (err: any) {
        console.log(`${colors.red}❌ Build failed: ${err.message}${colors.reset}`);
        process.exit(1);
    }
}

main();
