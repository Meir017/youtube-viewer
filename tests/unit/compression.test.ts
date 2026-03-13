import { describe, test, expect } from 'bun:test';
import { compressResponse } from '../../website/api-response';

describe('API response compression', () => {
    test('gzips large JSON responses when the client accepts gzip', async () => {
        const payload = {
            videos: Array.from({ length: 300 }, (_, index) => ({
                id: `video-${index}`,
                title: `Video ${index}`,
            })),
        };
        const request = new Request('http://localhost/api/collections', {
            headers: { 'Accept-Encoding': 'br, gzip' },
        });

        const response = await compressResponse(request, Response.json(payload));
        const compressedBody = new Uint8Array(await response.arrayBuffer());
        const decompressedBody = Bun.gunzipSync(compressedBody);
        const decodedPayload = JSON.parse(new TextDecoder().decode(decompressedBody));

        expect(response.headers.get('Content-Encoding')).toBe('gzip');
        expect(response.headers.get('Vary')).toBe('Accept-Encoding');
        expect(decodedPayload).toEqual(payload);
    });

    test('does not compress small JSON responses', async () => {
        const payload = { ok: true };
        const request = new Request('http://localhost/api/collections', {
            headers: { 'Accept-Encoding': 'gzip' },
        });

        const response = await compressResponse(request, Response.json(payload));

        expect(response.headers.get('Content-Encoding')).toBeNull();
        expect(await response.json()).toEqual(payload);
    });

    test('does not compress non-JSON responses', async () => {
        const body = 'x'.repeat(2048);
        const request = new Request('http://localhost/api/collections', {
            headers: { 'Accept-Encoding': 'gzip' },
        });

        const response = await compressResponse(request, new Response(body, {
            headers: { 'Content-Type': 'text/plain' },
        }));

        expect(response.headers.get('Content-Encoding')).toBeNull();
        expect(await response.text()).toBe(body);
    });
});
