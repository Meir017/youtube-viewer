import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The UI state cache persists the active collection + view + filters
// (search, sort, channel, duration, age) into localStorage so a refresh
// restores the same view. This suite guards the wiring on both clients.

const LIVE = readFileSync(resolve(import.meta.dir, '../../website/public/app.ts'), 'utf8');
const STATIC = readFileSync(resolve(import.meta.dir, '../../static-website/app.ts'), 'utf8');

const SHARED_REQUIREMENTS = [
    {
        title: 'declares a versioned localStorage key',
        check: (src: string) => {
            expect(src).toMatch(/UI_STATE_STORAGE_KEY\s*=\s*['"]youtube-viewer:[^'"]*ui-state:v1['"]/);
        },
    },
    {
        title: 'defines saveUiState / loadUiState / snapshotUiState / applyUiStateScalars',
        check: (src: string) => {
            expect(src).toMatch(/^function snapshotUiState\(/m);
            expect(src).toMatch(/^function saveUiState\(/m);
            expect(src).toMatch(/^function loadUiState\(/m);
            expect(src).toMatch(/^function applyUiStateScalars\(/m);
        },
    },
    {
        title: 'gates saves with uiStateLoaded so boot-time mutations are not persisted',
        check: (src: string) => {
            expect(src).toContain('uiStateLoaded');
            expect(src).toMatch(/if\s*\(!uiStateLoaded\)\s*return/);
        },
    },
    {
        title: 'debounces saves with a timer',
        check: (src: string) => {
            expect(src).toContain('uiStateSaveTimer');
            expect(src).toMatch(/setTimeout\(/);
        },
    },
    {
        title: 'wraps localStorage and JSON.parse in try/catch',
        check: (src: string) => {
            // saveUiState try/catch around setItem
            expect(src).toMatch(/setItem\(UI_STATE_STORAGE_KEY[\s\S]*?catch/);
            // loadUiState try/catch around getItem and JSON.parse
            expect(src).toMatch(/getItem\(UI_STATE_STORAGE_KEY[\s\S]*?catch/);
            expect(src).toMatch(/JSON\.parse\(raw\)[\s\S]*?catch/);
        },
    },
    {
        title: 'rejects payloads without v === 1 (schema versioning)',
        check: (src: string) => {
            expect(src).toMatch(/parsed\.v\s*!==\s*1/);
        },
    },
    {
        title: 'serialises Infinity values as null',
        check: (src: string) => {
            expect(src).toContain('serializeMaybeInfinity');
            expect(src).toMatch(/Number\.isFinite\(n\)\s*\?\s*n\s*:\s*null/);
        },
    },
    {
        title: 'snapshot includes every required field',
        check: (src: string) => {
            const snapshot = src.match(/function snapshotUiState\([^]*?\n\}/);
            expect(snapshot).not.toBeNull();
            const body = snapshot![0];
            for (const key of [
                'collectionId',
                'view',
                'activeChannel',
                'searchQuery',
                'searchQueryShorts',
                'sort',
                'duration',
                'age',
            ]) {
                expect(body).toContain(key);
            }
        },
    },
    {
        title: 'falls back when saved collectionId is missing from current collections',
        check: (src: string) => {
            // The boot path checks `collections.some(c => c.id === saved.collectionId)`.
            expect(src).toMatch(/collections\.some\(c\s*=>\s*c\.id\s*===\s*saved\.collectionId\)/);
        },
    },
    {
        title: 'validates saved channel index against loaded channels',
        check: (src: string) => {
            expect(src).toMatch(/idx\s*<\s*channels\.length/);
            // Falls back to 'all' on out-of-range
            expect(src).toMatch(/'all'/);
        },
    },
    {
        title: 'reflects scalar state into DOM inputs (search / duration / age / sort buttons)',
        check: (src: string) => {
            expect(src).toMatch(/searchBox[\s\S]*?\.value\s*=\s*searchQuery/);
            expect(src).toMatch(/searchBoxShorts[\s\S]*?\.value\s*=\s*searchQueryShorts/);
            expect(src).toMatch(/minDurationInput[\s\S]*?\.value\s*=/);
            expect(src).toMatch(/ageFromDaysInput[\s\S]*?\.value\s*=/);
            // Sort buttons get .active toggled and the matching one's icon updated
            expect(src).toMatch(/sortButtons\.forEach/);
            expect(src).toMatch(/dataset\.sort\s*===\s*currentSort\.by/);
        },
    },
    {
        title: 'wires saveUiState into every mutation handler',
        check: (src: string) => {
            // Each of these functions should end (or include) a saveUiState() call
            const handlers = [
                'handleSort',
                'handleSearch',
                'handleSearchShorts',
                'handleDurationFilter',
                'handleAgePreset',
                'handleCustomAgeApply',
                'setActiveChannel',
                'toggleHighlightsView',
            ];
            for (const fn of handlers) {
                const rx = new RegExp(`function ${fn}\\([^]*?saveUiState\\(\\)`);
                expect(src).toMatch(rx);
            }
        },
    },
];

const LIVE_ONLY_REQUIREMENTS = [
    {
        title: 'live: persists starred / hidden views via toggleStarredVideosView and toggleHiddenVideosView',
        check: (src: string) => {
            expect(src).toMatch(/function toggleStarredVideosView\([^]*?saveUiState\(\)/);
            expect(src).toMatch(/function toggleHiddenVideosView\([^]*?saveUiState\(\)/);
        },
    },
    {
        title: 'live: snapshot view enum covers videos / highlights / starred / hidden',
        check: (src: string) => {
            const snapshot = src.match(/function snapshotUiState\([^]*?\n\}/);
            const body = snapshot![0];
            expect(body).toContain("'highlights'");
            expect(body).toContain("'starred'");
            expect(body).toContain("'hidden'");
        },
    },
    {
        title: 'live: applyUiStateScalars handles all four view values',
        check: (src: string) => {
            expect(src).toMatch(/case 'highlights':/);
            expect(src).toMatch(/case 'starred':/);
            expect(src).toMatch(/case 'hidden':/);
        },
    },
];

const STATIC_ONLY_REQUIREMENTS = [
    {
        title: 'static: snapshot view enum covers videos / highlights only',
        check: (src: string) => {
            const snapshot = src.match(/function snapshotUiState\([^]*?\n\}/);
            const body = snapshot![0];
            expect(body).toContain("'highlights'");
            // No starred / hidden in the static client
            expect(body).not.toContain("'starred'");
            expect(body).not.toContain("'hidden'");
        },
    },
];

for (const [name, src] of [['live', LIVE], ['static', STATIC]] as const) {
    describe(`ui-state-cache wiring (${name})`, () => {
        for (const req of SHARED_REQUIREMENTS) {
            test(req.title, () => req.check(src));
        }
    });
}

describe('ui-state-cache live-only requirements', () => {
    for (const req of LIVE_ONLY_REQUIREMENTS) {
        test(req.title, () => req.check(LIVE));
    }
});

describe('ui-state-cache static-only requirements', () => {
    for (const req of STATIC_ONLY_REQUIREMENTS) {
        test(req.title, () => req.check(STATIC));
    }
});

// Behavioural test: re-implement the helpers in isolation to assert the
// serialise/deserialise contract (Infinity → null round-trip and friends).
describe('ui-state-cache serialisation contract', () => {
    function serializeMaybeInfinity(n: number) {
        return Number.isFinite(n) ? n : null;
    }
    function deserializeMaybeInfinity(v: unknown, fallback: number) {
        if (v === null || v === undefined) return fallback;
        const n = Number(v);
        if (!Number.isFinite(n)) return fallback;
        return n;
    }

    test('Infinity → null → Infinity round-trip', () => {
        expect(serializeMaybeInfinity(Infinity)).toBeNull();
        expect(deserializeMaybeInfinity(null, Infinity)).toBe(Infinity);
        expect(deserializeMaybeInfinity(undefined, Infinity)).toBe(Infinity);
    });

    test('finite numbers round-trip unchanged', () => {
        expect(serializeMaybeInfinity(0)).toBe(0);
        expect(serializeMaybeInfinity(42)).toBe(42);
        expect(deserializeMaybeInfinity(42, Infinity)).toBe(42);
        expect(deserializeMaybeInfinity(0, Infinity)).toBe(0);
    });

    test('garbage values fall back to provided default', () => {
        expect(deserializeMaybeInfinity('abc', 7)).toBe(7);
        expect(deserializeMaybeInfinity(NaN, 7)).toBe(7);
    });
});
