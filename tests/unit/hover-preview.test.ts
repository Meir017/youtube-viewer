import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The hover-to-popup preview shows a centered modal-style panel (with big
// thumbnail + scrollable description) on hover dwell. It is implemented in
// both the live client and the static client; this suite guards the wiring
// on both.

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

        test('defines handleCardHover and handleCardLeave at top level', () => {
            expect(src).toMatch(/^function handleCardHover\(/m);
            expect(src).toMatch(/^function handleCardLeave\(/m);
        });

        test('has a shared hover-preview element lazy-built on demand', () => {
            expect(src).toMatch(/function getHoverPreviewEl\(/);
            expect(src).toContain("el.className = 'hover-preview'");
            expect(src).toContain('document.body.appendChild(el)');
        });

        test('builds popup HTML with thumbnail, title, backdrop and description', () => {
            expect(src).toMatch(/function buildHoverPreviewHtml\(/);
            expect(src).toContain('hover-preview-backdrop');
            expect(src).toContain('hover-preview-panel');
            expect(src).toContain('hover-preview-thumb');
            expect(src).toContain('hover-description is-loading');
        });

        test('loads description lazily via loadVideoDescription', () => {
            expect(src).toMatch(/loadVideoDescription\(videoId\)/);
        });

        test('guards against stale description resolution when hovering another card', () => {
            expect(src).toContain('hoverPreviewVideoId');
        });

        test('dismisses when the pointer leaves both the card and the popup', () => {
            // Card's mouseleave delegates to popup if the pointer moved into it,
            // and the popup's own mouseleave hides it unless heading back to a card.
            expect(src).toContain("closest('#hoverPreview')");
            expect(src).toContain("closest('.video-card[data-video-id]')");
            expect(src).toMatch(/function hideHoverPreview\(/);
        });

        test('uses a dwell timer (HOVER_DWELL_MS)', () => {
            expect(src).toContain('HOVER_DWELL_MS');
        });

        test('registry payload includes thumbnail and duration for popup rendering', () => {
            expect(src).toMatch(/thumbnail[^}]*imdb\s*\}/s);
            expect(src).toMatch(/duration[^}]*thumbnail/s);
        });

        test('no per-card in-place hover panel is rendered any more', () => {
            expect(src).not.toContain('video-card-hover-details');
        });
    });
}

for (const [name, css] of [['live', LIVE_CSS], ['static', STATIC_CSS]] as const) {
    describe(`hover-preview CSS (${name})`, () => {
        test('popup container is fixed and full-viewport', () => {
            expect(css).toMatch(/\.hover-preview\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0/);
        });

        test('popup panel is centered over the viewport', () => {
            expect(css).toMatch(/\.hover-preview-panel[\s\S]*?top:\s*50%[\s\S]*?left:\s*50%[\s\S]*?translate\(-50%,\s*-50%\)/);
        });

        test('popup has a dim backdrop', () => {
            expect(css).toContain('.hover-preview-backdrop');
            expect(css).toMatch(/\.hover-preview-backdrop[\s\S]*?background:\s*rgba\(0,\s*0,\s*0/);
        });

        test('popup body is scrollable', () => {
            expect(css).toMatch(/\.hover-preview-body[\s\S]*?overflow-y:\s*auto/);
        });

        test('description has its own scrollable max-height', () => {
            expect(css).toMatch(/\.hover-description[\s\S]*?max-height:[\s\S]*?overflow-y:\s*auto/);
        });

        test('popup is hidden on touch-only devices', () => {
            expect(css).toMatch(/@media\s+not\s+all\s+and\s+\(hover:\s*hover\)\s+and\s+\(pointer:\s*fine\)/);
        });

        test('is-visible class toggles the popup on', () => {
            expect(css).toMatch(/\.hover-preview\.is-visible[\s\S]*?opacity:\s*1/);
        });

        test('no stale in-card hover panel styles remain', () => {
            expect(css).not.toContain('.video-card-hover-details');
        });

        test('panel scales up from a smaller starting size (grow animation)', () => {
            // Starting state is smaller than 1 and transitions to scale(1)
            expect(css).toMatch(/\.hover-preview-panel[\s\S]*?transform:\s*translate\(-50%,\s*-50%\)\s*scale\(0\.\d+\)/);
            expect(css).toMatch(/\.hover-preview\.is-visible\s+\.hover-preview-panel[\s\S]*?transform:\s*translate\(-50%,\s*-50%\)\s*scale\(1\)/);
        });

        test('panel has a transition on transform', () => {
            expect(css).toMatch(/\.hover-preview-panel[\s\S]*?transition:[\s\S]*?transform/);
        });

        test('respects prefers-reduced-motion', () => {
            expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
        });

        test('backdrop is non-interactive so it cannot steal hover from the card', () => {
            expect(css).toMatch(/\.hover-preview-backdrop[\s\S]*?pointer-events:\s*none/);
        });
    });
}
