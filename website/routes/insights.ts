import type { VideoMeta, VideoInsights } from '../copilot-insights';

export interface InsightsService {
    getVideoInsights(videoId: string): VideoInsights | undefined;
    startVideoInsights(videoId: string, meta: VideoMeta, customPrompt?: string): VideoInsights;
    cancelVideoInsights(videoId: string): Promise<boolean>;
}

export interface InsightsHandlerDeps {
    insightsService: InsightsService;
}

/**
 * POST /api/videos/:videoId/insights — Trigger or retrieve insights
 * Body: { title, channelTitle, description, duration, publishedTime, publishDate, isShort, customPrompt? }
 */
export async function startInsightsHandler(
    deps: InsightsHandlerDeps,
    videoId: string,
    body: VideoMeta & { customPrompt?: string }
): Promise<Response> {
    const { customPrompt, ...meta } = body;
    const insights = deps.insightsService.startVideoInsights(videoId, meta, customPrompt);
    return Response.json(insights);
}

/**
 * GET /api/videos/:videoId/insights — Poll for results
 */
export async function getInsightsHandler(
    deps: InsightsHandlerDeps,
    videoId: string
): Promise<Response> {
    const insights = deps.insightsService.getVideoInsights(videoId);
    if (!insights) {
        return Response.json({ status: 'not_started' });
    }
    return Response.json(insights);
}

/**
 * DELETE /api/videos/:videoId/insights — Cancel ongoing research
 */
export async function cancelInsightsHandler(
    deps: InsightsHandlerDeps,
    videoId: string
): Promise<Response> {
    const cancelled = await deps.insightsService.cancelVideoInsights(videoId);
    return Response.json({ cancelled });
}
