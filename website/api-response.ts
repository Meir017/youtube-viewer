const MIN_COMPRESSED_JSON_BYTES = 1024;

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Add CORS headers to a response
 */
export function withCors(response: Response): Response {
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
    });
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

export async function compressResponse(req: Request, response: Response): Promise<Response> {
    if (req.method === 'HEAD') {
        return response;
    }

    const acceptEncoding = req.headers.get('accept-encoding')?.toLowerCase() ?? '';
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

    if (
        !acceptEncoding.includes('gzip') ||
        !contentType.includes('application/json') ||
        response.headers.has('content-encoding')
    ) {
        return response;
    }

    const body = await response.clone().arrayBuffer();
    if (body.byteLength < MIN_COMPRESSED_JSON_BYTES) {
        return response;
    }

    const headers = new Headers(response.headers);
    headers.set('Content-Encoding', 'gzip');
    headers.set('Vary', 'Accept-Encoding');
    headers.delete('Content-Length');

    return new Response(Bun.gzipSync(new Uint8Array(body)), {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

export async function finalizeApiResponse(req: Request, response: Response): Promise<Response> {
    return compressResponse(req, withCors(response));
}
