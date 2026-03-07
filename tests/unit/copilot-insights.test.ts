import { describe, test, expect } from 'bun:test';

// Test the module's exported interface types and prompt building logic.
// We cannot easily unit test the Copilot SDK integration without a running instance,
// but we can test the cache behavior and exported functions.

// Since copilot-insights.ts has side effects (singleton client),
// we test the cache/state management via the route handlers (see routes/insights.test.ts).
// Here we focus on verifying the module structure and types.

describe('Copilot Insights Module', () => {
    test('module exports expected functions', async () => {
        const mod = await import('../../website/copilot-insights');
        expect(typeof mod.getVideoInsights).toBe('function');
        expect(typeof mod.startVideoInsights).toBe('function');
        expect(typeof mod.shutdownInsightsClient).toBe('function');
    });

    test('getVideoInsights returns undefined for unknown video', async () => {
        const { getVideoInsights } = await import('../../website/copilot-insights');
        const result = getVideoInsights('nonexistent-video-id-xyz');
        expect(result).toBeUndefined();
    });
});
