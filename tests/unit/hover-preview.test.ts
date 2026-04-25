import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The hover-to-popup preview shows a Netflix-style in-place zoom: on hover
// dwell the shared preview element anchors to the hovered card's bounding
// rect and scales up from card-size to a larger size with an edge-aware
// transform-origin. It is implemented in both the live client and the
// static client; this suite guards the wiring on both.

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

        test('builds popup HTML with thumbnail, title and description', () => {
            expect(src).toMatch(/function buildHoverPreviewHtml\(/);
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

        test('renders an IMDb link to imdb.com/title/<tconst>/ in the popup', () => {
            expect(src).toContain('hover-imdb-link');
            expect(src).toContain('https://www.imdb.com/title/');
            expect(src).toContain('video.imdb.tconst');
            expect(src).toContain('target="_blank"');
            expect(src).toContain('rel="noopener noreferrer"');
        });

        test('anchors the panel to the card via getBoundingClientRect + inline styles', () => {
            expect(src).toContain('getBoundingClientRect');
            expect(src).toMatch(/transformOrigin/);
            expect(src).toMatch(/panel\.style\.(top|left|width)\s*=/);
            expect(src).toContain('--hover-start-scale');
        });

        test('edge-aware transform-origin (left / right / center)', () => {
            expect(src).toContain("'left'");
            expect(src).toContain("'right'");
            expect(src).toContain("'center'");
        });

        test('dismisses on scroll and resize to avoid stale positioning', () => {
            expect(src).toMatch(/addEventListener\(\s*['"]scroll['"][\s\S]*?hideHoverPreview/);
            expect(src).toMatch(/addEventListener\(\s*['"]resize['"][\s\S]*?hideHoverPreview/);
        });
    });
}

for (const [name, css] of [['live', LIVE_CSS], ['static', STATIC_CSS]] as const) {
    describe(`hover-preview CSS (${name})`, () => {
        test('popup container is fixed and full-viewport', () => {
            expect(css).toMatch(/\.hover-preview\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0/);
        });

        test('popup panel anchors to the card (no viewport-centering)', () => {
            // Old modal layout pinned the panel to the viewport via
            // top: 50%; left: 50%; translate(-50%,-50%). The in-place zoom
            // instead positions the panel absolutely via inline JS styles.
            expect(css).not.toMatch(/\.hover-preview-panel[\s\S]*?top:\s*50%/);
            expect(css).not.toMatch(/\.hover-preview-panel[\s\S]*?translate\(-50%,\s*-50%\)/);
            expect(css).toMatch(/\.hover-preview-panel[\s\S]*?position:\s*fixed/);
        });

        test('no backdrop — the wrapper stays pointer-events: none', () => {
            expect(css).not.toContain('.hover-preview-backdrop');
            expect(css).toMatch(/\.hover-preview\s*\{[\s\S]*?pointer-events:\s*none/);
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

        test('panel scales up from a card-sized start to full size (grow animation)', () => {
            // Starting state reads the runtime scale from a CSS custom prop
            // (--hover-start-scale), set per-card based on its width.
            expect(css).toMatch(/\.hover-preview-panel[\s\S]*?transform:\s*scale\(var\(--hover-start-scale[^)]*\)\)/);
            expect(css).toMatch(/\.hover-preview\.is-visible\s+\.hover-preview-panel[\s\S]*?transform:\s*scale\(1\)/);
        });

        test('panel has a transition on transform', () => {
            expect(css).toMatch(/\.hover-preview-panel[\s\S]*?transition:[\s\S]*?transform/);
        });

        test('respects prefers-reduced-motion', () => {
            expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
        });
    });
}
