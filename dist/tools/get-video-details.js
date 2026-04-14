import { z } from "zod";
import { getVideoDetails } from "../services/youtube-api.js";
import { fetchTranscript } from "../services/transcript.js";
import { getDb } from "../db/connection.js";
import { upsertVideo } from "../db/repos/videos.js";
import { upsertTranscript } from "../db/repos/transcripts.js";
/**
 * Consolidated fetch for a single video: metadata + optional transcript in one call.
 *
 * Partial success is NOT a failure: if metadata succeeds but the transcript
 * cannot be retrieved (no captions, disabled, network error), the video row is
 * still upserted and the transcript status reflects the reason. Only a hard
 * metadata failure propagates as a thrown error — callers should surface that
 * to the user.
 */
export async function fetchAndStoreVideo(videoId, includeTranscript) {
    // 1. Metadata (required — throws on failure so the top-level tool can surface it)
    const details = await getVideoDetails(videoId);
    const resolvedVideoId = details.videoId;
    try {
        upsertVideo(getDb(), details, "get_video_details");
    }
    catch (err) {
        process.stderr.write(`youtube-mcp: DB upsert failed (get_video_details): ${err}\n`);
    }
    if (!includeTranscript) {
        return {
            videoId: resolvedVideoId,
            details,
            metadata: "ok",
            transcript: "skipped",
        };
    }
    // 2. Transcript (best-effort — classify errors, never fail the whole call)
    try {
        const transcript = await fetchTranscript(resolvedVideoId);
        try {
            upsertTranscript(getDb(), transcript);
        }
        catch (err) {
            process.stderr.write(`youtube-mcp: DB upsert failed (get_video_details transcript): ${err}\n`);
        }
        return {
            videoId: resolvedVideoId,
            details,
            metadata: "ok",
            transcript: "ok",
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const lower = message.toLowerCase();
        let status;
        if (lower.includes("no captions") ||
            lower.includes("captions disabled") ||
            lower.includes("not available") ||
            lower.includes("http 404")) {
            status = "missing";
        }
        else if (lower.includes("transcripts disabled") ||
            lower.includes("captions are disabled")) {
            status = "unavailable";
        }
        else {
            status = "failed";
        }
        process.stderr.write(`youtube-mcp: transcript fetch ${status} for ${resolvedVideoId}: ${message}\n`);
        return {
            videoId: resolvedVideoId,
            details,
            metadata: "ok",
            transcript: status,
            transcriptReason: message,
        };
    }
}
export function registerGetVideoDetailsTool(server) {
    server.tool("get_video_details", "Canonical single-video fetch entrypoint. Gets video metadata and (by default) transcript in one call, upserting both the `videos` and `transcripts` rows. Partial success is supported: if metadata succeeds but the transcript is missing, the tool still returns OK with the transcript status set accordingly.", {
        videoId: z
            .string()
            .describe("YouTube video ID or full URL"),
        includeTranscript: z
            .boolean()
            .default(true)
            .describe("When true (default), also fetch and upsert the transcript row in the same call. Set to false to fetch metadata only."),
    }, async ({ videoId, includeTranscript }) => {
        const outcome = await fetchAndStoreVideo(videoId, includeTranscript);
        const { details } = outcome;
        const views = Number(details.statistics.viewCount).toLocaleString();
        const likes = Number(details.statistics.likeCount).toLocaleString();
        const comments = Number(details.statistics.commentCount).toLocaleString();
        const transcriptLine = outcome.transcriptReason
            ? `- transcript: ${outcome.transcript} (${outcome.transcriptReason})`
            : `- transcript: ${outcome.transcript}`;
        const text = [
            `Title: ${details.title}`,
            `Channel: ${details.channelTitle}`,
            `URL: https://youtube.com/watch?v=${details.videoId}`,
            `Duration: ${details.duration}`,
            `Published: ${new Date(details.publishedAt).toLocaleDateString()}`,
            ``,
            `Statistics:`,
            `  Views: ${views}`,
            `  Likes: ${likes}`,
            `  Comments: ${comments}`,
            ``,
            details.tags.length > 0
                ? `Tags: ${details.tags.join(", ")}`
                : "Tags: none",
            ``,
            `Description:`,
            details.description,
            ``,
            `Statuses:`,
            `- metadata: ${outcome.metadata}`,
            transcriptLine,
        ].join("\n");
        return { content: [{ type: "text", text }] };
    });
}
//# sourceMappingURL=get-video-details.js.map