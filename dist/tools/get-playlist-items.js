import { z } from "zod";
import { fetchOAuthApi } from "../services/youtube-oauth.js";
import { getDb } from "../db/connection.js";
import { upsertPlaylistItems } from "../db/repos/playlists.js";
import { upsertVideo } from "../db/repos/videos.js";
import { fetchAndStoreVideo } from "./get-video-details.js";
export function registerGetPlaylistItemsTool(server) {
    server.tool("get_playlist_items", "Canonical playlist fetch entrypoint. Fetches all videos from a YouTube playlist by its ID. With hydrate=true (default), sequentially fetches and upserts metadata + transcript for every item via get_video_details. With hydrate=false, behaves as a list-only operation. Requires OAuth credentials (YOUTUBE_OAUTH_TOKEN_PATH).", {
        playlistId: z
            .string()
            .describe("YouTube playlist ID (e.g. PLbclGrMrkq04ygNoBJC4Y1LPfBo8qzFhA)"),
        maxResults: z
            .number()
            .min(1)
            .max(500)
            .default(500)
            .describe("Maximum total videos to return (default 500, paginates automatically)"),
        hydrate: z
            .boolean()
            .default(true)
            .describe("When true (default), sequentially call get_video_details(includeTranscript=true) for every playlist item, upserting both metadata and transcripts. When false, only list and upsert playlist/video rows with the thin data from playlistItems.list."),
    }, async ({ playlistId, maxResults, hydrate }) => {
        const items = [];
        let pageToken;
        do {
            const params = {
                part: "snippet,contentDetails",
                playlistId,
                maxResults: String(Math.min(50, maxResults - items.length)),
            };
            if (pageToken)
                params.pageToken = pageToken;
            const data = await fetchOAuthApi("playlistItems", params);
            const batch = data.items ?? [];
            items.push(...batch);
            const next = data.nextPageToken;
            pageToken = items.length < maxResults ? next : undefined;
        } while (pageToken);
        if (items.length === 0) {
            return {
                content: [{ type: "text", text: `No videos found in playlist ${playlistId}.` }],
            };
        }
        try {
            const db = getDb();
            upsertPlaylistItems(db, items.map((item) => ({
                playlistItemId: item.id,
                playlistId,
                videoId: item.contentDetails.videoId,
                position: item.snippet.position,
                title: item.snippet.title,
                channelTitle: item.snippet.videoOwnerChannelTitle ?? null,
                videoPublishedAt: item.contentDetails.videoPublishedAt ?? null,
            })));
            if (!hydrate) {
                // Thin upsert — only the data we have from playlistItems.list
                for (const item of items) {
                    upsertVideo(db, {
                        videoId: item.contentDetails.videoId,
                        title: item.snippet.title,
                        channelTitle: item.snippet.videoOwnerChannelTitle,
                        description: item.snippet.description,
                        publishedAt: item.contentDetails.videoPublishedAt ?? item.snippet.publishedAt,
                    }, "playlist_items");
                }
            }
        }
        catch (err) {
            process.stderr.write(`youtube-mcp: DB upsert failed (get_playlist_items): ${err}\n`);
        }
        // Hydrate pass — for each item, call the consolidated fetch (metadata + transcript).
        // Sequential to avoid hammering the API; partial failures per item are tolerated.
        const hydrationOutcomes = [];
        if (hydrate) {
            for (const item of items) {
                const videoId = item.contentDetails.videoId;
                try {
                    const outcome = await fetchAndStoreVideo(videoId, true);
                    hydrationOutcomes.push({
                        videoId: outcome.videoId,
                        metadata: outcome.metadata,
                        transcript: outcome.transcript,
                        reason: outcome.transcriptReason,
                    });
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    process.stderr.write(`youtube-mcp: hydrate failed for ${videoId}: ${message}\n`);
                    hydrationOutcomes.push({
                        videoId,
                        metadata: "failed",
                        transcript: "skipped",
                        reason: message,
                    });
                }
            }
        }
        const formatted = items
            .map((item) => {
            const s = item.snippet;
            const videoId = item.contentDetails.videoId;
            const channel = s.videoOwnerChannelTitle ?? "Unknown";
            const pubDate = item.contentDetails.videoPublishedAt
                ? new Date(item.contentDetails.videoPublishedAt).toLocaleDateString()
                : "N/A";
            return [
                `${s.position + 1}. ${s.title}`,
                `   URL: https://youtube.com/watch?v=${videoId}`,
                `   Channel: ${channel} | Published: ${pubDate}`,
                `   Item ID: ${item.id}`,
            ].join("\n");
        })
            .join("\n\n");
        const parts = [
            `Playlist ${playlistId} — ${items.length} video(s):`,
            ``,
            formatted,
        ];
        if (hydrate) {
            const statusLines = hydrationOutcomes.map((o) => {
                const transcriptPart = o.reason
                    ? `transcript=${o.transcript} (${o.reason})`
                    : `transcript=${o.transcript}`;
                return `- ${o.videoId}: metadata=${o.metadata} ${transcriptPart}`;
            });
            parts.push(``, `Hydration statuses (${hydrationOutcomes.length} items):`, ...statusLines);
        }
        return {
            content: [{ type: "text", text: parts.join("\n") }],
        };
    });
}
//# sourceMappingURL=get-playlist-items.js.map