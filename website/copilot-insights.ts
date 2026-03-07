import { CopilotClient, approveAll, type SessionEvent } from "@github/copilot-sdk";
import { createLogger } from "../generator/logger.ts";
const log = createLogger('insights');

export interface VideoMeta {
    title?: string;
    channelTitle?: string;
    description?: string;
    duration?: string;
    publishedTime?: string;
    publishDate?: string;
    isShort?: boolean;
}

export interface VideoInsights {
    videoId: string;
    status: 'pending' | 'researching' | 'complete' | 'error';
    content?: string;
    generatedAt?: string;
    error?: string;
}

// In-memory cache of insights per video ID
const insightsCache = new Map<string, VideoInsights>();

// Track active Copilot sessions for cancellation
const activeSessions = new Map<string, { abort: () => Promise<void> }>();

// Singleton client (lazy-initialized)
let copilotClient: CopilotClient | null = null;

async function getClient(): Promise<CopilotClient> {
    if (!copilotClient) {
        copilotClient = new CopilotClient();
        await copilotClient.start();
    }
    return copilotClient;
}

/**
 * Build a research prompt tailored to the video content.
 */
function buildResearchPrompt(videoId: string, meta: VideoMeta): string {
    const parts: string[] = [];
    parts.push(`Research the following YouTube video and provide useful contextual information.`);
    parts.push('');
    parts.push(`**Video ID:** ${videoId}`);
    parts.push(`**YouTube URL:** https://www.youtube.com/watch?v=${videoId}`);
    if (meta.title) parts.push(`**Title:** ${meta.title}`);
    if (meta.channelTitle) parts.push(`**Channel:** ${meta.channelTitle}`);
    if (meta.duration) parts.push(`**Duration:** ${meta.duration}`);
    if (meta.publishDate) parts.push(`**Published:** ${meta.publishDate}`);
    else if (meta.publishedTime) parts.push(`**Published:** ${meta.publishedTime}`);
    if (meta.description) {
        const truncated = meta.description.length > 500
            ? meta.description.substring(0, 500) + '...'
            : meta.description;
        parts.push(`**Description excerpt:** ${truncated}`);
    }
    parts.push('');
    parts.push(`Use web search to find relevant information about this video's topic. Based on what the video is about, provide the most useful details:`);
    parts.push('');
    parts.push(`- **For movie/TV trailers:** Follow the MOVIE/TV SEARCH PROCEDURE below`);
    parts.push(`- **For podcasts/interviews:** A brief bio paragraph for each notable personality/guest in the video`);
    parts.push(`- **For tech talks/tutorials:** Links to referenced projects, tools, or libraries; speaker background`);
    parts.push(`- **For music videos:** Artist info, album name, streaming links`);
    parts.push(`- **For news/analysis:** Key facts, related articles, timeline of events`);
    parts.push(`- **General:** Key topics discussed, relevant external links`);
    parts.push('');
    parts.push(`## MOVIE/TV SEARCH PROCEDURE`);
    parts.push(`When the video is a movie trailer, TV series trailer, or film-related content, follow these steps IN ORDER:`);
    parts.push('');
    parts.push(`1. **Extract key details from the title:** Parse the movie/show name, year, and actor names from the video title. Note: the year in a trailer title (e.g., "(2026)") is often the trailer upload or release year — the IMDB entry may list an earlier production year.`);
    parts.push(`2. **Search for the IMDB page directly:** Search for the movie/show name combined with lead actor names and "IMDB" (e.g., \`"In Cold Light" Maika Monroe IMDB\`). Include actor names to disambiguate common titles.`);
    parts.push(`3. **If the direct IMDB search fails:** Search for the movie's Wikipedia page instead (e.g., \`"In Cold Light" 2026 film Wikipedia\`). Wikipedia articles almost always contain the IMDB link or the IMDB title ID (format: tt followed by digits).`);
    parts.push(`4. **Verify the IMDB link:** Confirm the IMDB page matches by checking that the title, cast, and director align with the trailer. The correct URL format is \`https://www.imdb.com/title/ttXXXXXXXX/\`.`);
    parts.push(`5. **For TV series:** Also include the season number (if the trailer is for a specific season), episode count, network/platform, and premiere date.`);
    parts.push('');
    parts.push(`**Required fields for movies/TV (include all that you can verify):**`);
    parts.push(`- IMDB link — this is REQUIRED. You MUST include a verified IMDB link for any movie or TV series. Do not consider the research complete without it. If you cannot find the IMDB page after exhausting all search strategies above, explicitly state that no IMDB page was found.`);
    parts.push(`- Rotten Tomatoes score (if available)`);
    parts.push(`- Release date / premiere date`);
    parts.push(`- Director`);
    parts.push(`- Main cast (top 3-5 actors with character names if available)`);
    parts.push(`- Brief synopsis (2-3 sentences, spoiler-free)`);
    parts.push(`- Genre`);
    parts.push(`- Streaming platform or distributor (e.g., Netflix, A24, Saban Films)`);
    parts.push('');
    parts.push(`## GENERAL VERIFICATION STEPS (you MUST follow these for ALL content types):`);
    parts.push(`1. First, search for the video topic to understand what it is about.`);
    parts.push(`2. For any external link you plan to include (IMDB, Rotten Tomatoes, Wikipedia, etc.), do a dedicated search to find the EXACT correct page. Search for the specific title AND the platform name (e.g., "Feel My Voice Netflix IMDB").`);
    parts.push(`3. Verify the search result matches the video's content — check that the title, year, studio/network, and key people all align. If anything is ambiguous or doesn't match, do NOT include the link.`);
    parts.push(`4. For people mentioned, verify their names and roles with a separate search before including bios.`);
    parts.push('');
    parts.push(`Format your response as clean markdown. Be concise but informative. Include actual URLs/links where possible, but ONLY if you have verified they are correct. Do not include the video title or URL in your response — just the research findings.`);

    return parts.join('\n');
}

/**
 * Get or start insights research for a video.
 * Returns the current state immediately (may be pending/researching/complete/error).
 */
export function getVideoInsights(videoId: string): VideoInsights | undefined {
    return insightsCache.get(videoId);
}

/**
 * Start researching insights for a video.
 * If already started, returns existing entry.
 * Returns the insights entry (status will be 'researching' for new requests).
 */
export function startVideoInsights(videoId: string, meta: VideoMeta): VideoInsights {
    const existing = insightsCache.get(videoId);
    if (existing) {
        return existing;
    }

    const insights: VideoInsights = {
        videoId,
        status: 'researching',
    };
    insightsCache.set(videoId, insights);

    // Fire and forget — run research in background
    runResearch(videoId, meta, insights).catch(err => {
        log.error(`[insights:${videoId}] Unhandled research error: ${err.message || err}`);
        insights.status = 'error';
        insights.error = err.message || 'Unknown error';
    });

    return insights;
}

/**
 * Log Copilot SDK session events for progress tracking.
 */
function logSessionEvent(videoId: string, event: SessionEvent): void {
    const tag = `[insights:${videoId}]`;
    switch (event.type) {
        case "session.start":
            log.info(`${tag} Session started (id: ${event.data.sessionId})`);
            break;
        case "assistant.turn_start":
            log.info(`${tag} Agent turn ${event.data.turnId} started`);
            break;
        case "assistant.turn_end":
            log.info(`${tag} Agent turn ${event.data.turnId} ended`);
            break;
        case "assistant.intent":
            log.info(`${tag} Intent: ${event.data.intent}`);
            break;
        case "tool.execution_start":
            log.info(`${tag} Tool started: ${event.data.toolName}`);
            break;
        case "tool.execution_complete":
            if (event.data.success) {
                log.info(`${tag} Tool completed: ${(event.data as any).toolName ?? event.data.toolCallId}`);
            } else {
                log.warn(`${tag} Tool failed: ${(event.data as any).toolName ?? event.data.toolCallId}`);
            }
            break;
        case "subagent.started":
            log.info(`${tag} Sub-agent started: ${event.data.agentName}`);
            break;
        case "subagent.completed":
            log.info(`${tag} Sub-agent completed: ${event.data.agentName}`);
            break;
        case "subagent.failed":
            log.error(`${tag} Sub-agent failed: ${(event.data as any).agentName}`);
            break;
        case "assistant.usage":
            log.info(`${tag} Token usage: model=${event.data.model} in=${event.data.inputTokens ?? '?'} out=${event.data.outputTokens ?? '?'}`);
            break;
        case "session.idle":
            log.info(`${tag} Session idle`);
            break;
        case "session.error":
            log.error(`${tag} Session error: ${event.data.message}`);
            break;
        case "session.warning":
            log.warn(`${tag} Warning: ${(event.data as any).message ?? JSON.stringify(event.data)}`);
            break;
    }
}

/**
 * Background research using Copilot SDK.
 */
async function runResearch(videoId: string, meta: VideoMeta, insights: VideoInsights): Promise<void> {
    const tag = `[insights:${videoId}]`;
    const startTime = Date.now();
    log.info(`AI Insights: ${meta.title || videoId}`);
    log.info(`${tag} Starting research for video: ${videoId}`);

    log.info(`${tag} Initializing Copilot client...`);
    const client = await getClient();
    log.info(`${tag} Copilot client ready`);

    log.info(`${tag} Creating session (model: claude-sonnet-4.6)...`);
    const session = await client.createSession({
        model: "claude-sonnet-4.6",
        // TODO: Restrict permissions to only allow web_search tool instead of approving all
        onPermissionRequest: approveAll,
        systemMessage: {
            content: `You are a video research assistant. Your job is to research YouTube videos and provide concise, factual contextual information with relevant links.

CRITICAL RULES:
- Always use web_search to find up-to-date information.
- Use subagents for parallel searches if needed, but keep responses concise.
- VERIFY every link and fact you include. After finding a potential link (e.g., an IMDB page), do a follow-up web search to confirm it refers to the correct title, year, and creators. For example, if the video is a trailer for "Feel My Voice" by Netflix, search specifically for that exact title on IMDB and verify the result matches before including it.
- NEVER guess or hallucinate URLs. If you cannot verify a link is correct, omit it rather than risk providing a wrong one.
- Cross-reference: check that names, dates, and details from one source match what other sources say.
- Do not use any tools other than web_search. Do not create or edit any files.
- Keep your responses focused and well-structured in markdown format.

MOVIE/TV TRAILER STRATEGY:
When researching a movie or TV trailer, finding the IMDB link is your TOP PRIORITY. Follow this search strategy:
1. Search for the title + lead actors + "IMDB" (e.g., "In Cold Light Maika Monroe IMDB").
2. If no IMDB result appears, search for the title + "Wikipedia" — Wikipedia articles reliably link to IMDB pages.
3. The year in a YouTube trailer title (e.g., "(2026)") may differ from the IMDB listing year — search with actor names rather than relying solely on year.
4. Always confirm the IMDB URL format is https://www.imdb.com/title/ttXXXXXXXX/ before including it.
5. Including a verified IMDB link is REQUIRED for any movie or TV series — do not skip this step.`,
        },
        infiniteSessions: { enabled: false }
    });
    log.info(`${tag} Session created (id: ${session.sessionId})`);

    // Subscribe to all session events for progress logging
    const unsubscribeEvents = session.on((event: SessionEvent) => {
        logSessionEvent(videoId, event);
    });

    // Register session so it can be cancelled if the user closes the popup
    activeSessions.set(videoId, {
        abort: async () => {
            unsubscribeEvents();
            await session.abort();
            await session.destroy();
        },
    });

    try {
        const prompt = buildResearchPrompt(videoId, meta);
        log.info(`${tag} Sending research prompt (${prompt.length} chars), waiting up to 3 min...`);
        const result = await session.sendAndWait({ prompt }, 3 * 60_000);

        // If cancelled while awaiting, don't overwrite the cancelled state
        if (insights.status !== 'researching') {
            log.warn(`${tag} Research was cancelled while awaiting response`);
            return;
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (result?.data?.content) {
            insights.content = result.data.content;
            insights.status = 'complete';
            insights.generatedAt = new Date().toISOString();
            log.info(`${tag} Research complete in ${elapsed}s (${result.data.content.length} chars)`);
        } else {
            insights.status = 'error';
            insights.error = 'No response from Copilot';
            log.warn(`${tag} No response received after ${elapsed}s`);
        }
    } catch (err: any) {
        if (insights.status !== 'researching') return; // cancelled
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        insights.status = 'error';
        insights.error = err.message || 'Research failed';
        log.error(`${tag} Research failed after ${elapsed}s: ${err.message}`);
    } finally {
        unsubscribeEvents();
        activeSessions.delete(videoId);
        await session.destroy();
        log.info(`${tag} Session destroyed`);
    }
}

/**
 * Cancel an in-progress insights research session for a video.
 * Called when the user closes the video popup.
 */
export async function cancelVideoInsights(videoId: string): Promise<boolean> {
    const active = activeSessions.get(videoId);
    if (!active) return false;

    const insights = insightsCache.get(videoId);
    if (insights && insights.status === 'researching') {
        insightsCache.delete(videoId);
    }

    try {
        log.info(`[insights:${videoId}] Cancelling research session...`);
        await active.abort();
        log.info(`[insights:${videoId}] Research session cancelled`);
    } catch (err: any) {
        log.warn(`[insights:${videoId}] Error during cancellation: ${err.message}`);
    }
    activeSessions.delete(videoId);
    return true;
}

/**
 * Shut down the Copilot client (for graceful server shutdown).
 */
export async function shutdownInsightsClient(): Promise<void> {
    if (copilotClient) {
        await copilotClient.stop();
        copilotClient = null;
    }
}
