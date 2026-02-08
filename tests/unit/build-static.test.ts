import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { buildStatic } from '../../website-tools/build-static';

describe('build-static', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'build-static-test-'));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    test('copies all required files to output directory', async () => {
        const copied = await buildStatic(tempDir);

        expect(copied).toHaveLength(4);

        const names = copied.map(f => f.name);
        expect(names).toContain('index.html');
        expect(names).toContain('app.js');
        expect(names).toContain('styles.css');
        expect(names).toContain('data/channels.json');
    });

    test('output files exist on disk', async () => {
        await buildStatic(tempDir);

        const indexFile = Bun.file(join(tempDir, 'index.html'));
        expect(await indexFile.exists()).toBe(true);

        const appFile = Bun.file(join(tempDir, 'app.js'));
        expect(await appFile.exists()).toBe(true);

        const stylesFile = Bun.file(join(tempDir, 'styles.css'));
        expect(await stylesFile.exists()).toBe(true);

        const dataFile = Bun.file(join(tempDir, 'data', 'channels.json'));
        expect(await dataFile.exists()).toBe(true);
    });

    test('channels.json in output is valid JSON', async () => {
        await buildStatic(tempDir);

        const dataFile = Bun.file(join(tempDir, 'data', 'channels.json'));
        const data = await dataFile.json();
        expect(data).toHaveProperty('collections');
        expect(Array.isArray(data.collections)).toBe(true);
    });

    test('copied files have non-zero sizes', async () => {
        const copied = await buildStatic(tempDir);

        for (const file of copied) {
            expect(file.size).toBeGreaterThan(0);
        }
    });

    test('index.html in output references app.js', async () => {
        await buildStatic(tempDir);

        const indexFile = Bun.file(join(tempDir, 'index.html'));
        const content = await indexFile.text();
        expect(content).toContain('app.js');
        expect(content).toContain('styles.css');
    });

    test('app.js in output has no /api/ references', async () => {
        await buildStatic(tempDir);

        const appFile = Bun.file(join(tempDir, 'app.js'));
        const content = await appFile.text();
        expect(content).not.toContain('/api/');
    });
});
