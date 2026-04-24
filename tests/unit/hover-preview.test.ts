import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The hover-to-expand preview is implemented in both the live and static
// clients. Both apps are transpiled into the browser as non-module scripts
// via Bun.Transpiler, which is why the hover handlers must live at module
// top level and be referenced from inline on* attributes on each card.
// This smoke test guards the wiring in both files.

const LIVE = readFileSync(resolve(import.meta.dir, '../../website/public/app.ts'), 'utf8');
const STATIC = readFileSync(resolve(import.meta.dir, '../../static-website/app.ts'), 'utf8');

const LIVE_CSS = readFileSync(resolve(import.meta.dir, '../../website/public/styles.css'), 'utf8');
const STATIC_CSS = readFileSync(resolve(import.meta.dir, '../../static-website/styles.css'), 'utf8');

for (const [name, src] of [['live', LIVE], ['static', STATIC]] as const) {
    describe(`hover-preview markup (${name})`, () => {
        test('card carries data-video-id + hover handlers', () => {
            expect(src).toContain('data-video-id="${videoId}"');
            expect(src).toContain('onmouseenter="handleCardHover(event)"');
            expect(src).toContain('onmouseleave="handleCardLeave(event)"');
        });

        test('hover details panel is rendered as a direct child of the card', () => {
            expect(src).toContain('class="video-card-hover-details"');
            expect(src).toContain('class="hover-description is-loading"');
        });

        test('hover-description stops click propagation to keep modal closed', () => {
            expect(src).toContain('onclick="event.stopPropagation()"');
        });

        test('defines handleCardHover and handleCardLeave at top level', () => {
            expect(src).toMatch(/^function handleCardHover\(/m);
            expect(src).toMatch(/^function handleCardLeave\(/m);
        });

        test('handleCardHover calls loadVideoDescription with the card id', () => {
            expect(src).toMatch(/loadVideoDescription\(videoId\)/);
        });

        test('uses a dwell timer (HOVER_DWELL_MS)', () => {
            expect(src).toContain('HOVER_DWELL_MS');
        });
    });
}

for (const [name, css] of [['live', LIVE_CSS], ['static', STATIC_CSS]] as const) {
    describe(`hover-preview CSS (${name})`, () => {
        test('hover effect is gated behind fine-pointer media query', () => {
            expect(css).toContain('@media (hover: hover) and (pointer: fine)');
        });

        test('hover panel is absolutely positioned and scrollable', () => {
            expect(css).toContain('.video-card-hover-details');
            expect(css).toMatch(/\.video-card-hover-details[\s\S]*?position:\s*absolute/);
            expect(css).toMatch(/\.hover-description[\s\S]*?overflow-y:\s*auto/);
        });

        test('shorts opt out of the hover panel', () => {
            expect(css).toMatch(/\.short-card\s+\.video-card-hover-details\s*\{\s*display:\s*none/);
        });

        test('card overflow is relaxed on hover so the panel can escape', () => {
            expect(css).toMatch(/\.video-card:hover\s*\{[\s\S]*?overflow:\s*visible/);
        });
    });
}
