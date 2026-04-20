import { z } from "zod";
import { getDb } from "../db/connection.js";
import { getTranscriptByVideoId } from "../db/repos/transcripts.js";
// ---------------------------------------------------------------------------
// Core handler — dependency-injected for testability.
// The third argument (_fetchTranscript) is accepted but never called;
// it exists only as an injection point for test spies to verify no HTTP is made.
// ---------------------------------------------------------------------------
export async function handleGetTranscript(input, db, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
_fetchTranscript) {
    const row = getTranscriptByVideoId(db, input.videoId);
    if (!row) {
        return { videoId: input.videoId, transcript: null, status: "missing" };
    }
    return { videoId: input.videoId, transcript: row.full_text ?? null, status: "ok" };
}
// ---------------------------------------------------------------------------
// MCP tool registration
// ---------------------------------------------------------------------------
export function registerGetTranscriptTool(server) {
    server.tool("get_transcript", "Read a cached transcript for a YouTube video. Returns the stored full_text if available, or status=missing if not yet cached. ZERO outbound HTTP — this tool never fetches from InnerTube. To populate the cache, call get_video_details(includeTranscript=true) or get_playlist_items(hydrate=true).", {
        videoId: z.string().describe("YouTube video ID"),
    }, async ({ videoId }) => {
        const result = await handleGetTranscript({ videoId }, getDb());
        if (result.status === "missing") {
            return {
                content: [
                    {
                        type: "text",
                        text: `No cached transcript found for video: ${videoId}\nStatus: missing\nTo populate, call get_video_details(videoId="${videoId}", includeTranscript=true).`,
                    },
                ],
            };
        }
        return {
            content: [
                {
                    type: "text",
                    text: `Transcript for video: ${videoId}\nStatus: ok\n---\n${result.transcript}`,
                },
            ],
        };
    });
}
//# sourceMappingURL=get-transcript.js.map