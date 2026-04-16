import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchOAuthApi } from "../services/youtube-oauth.js";
import { getDb } from "../db/connection.js";
import { upsertPlaylistItems } from "../db/repos/playlists.js";
import { upsertVideo } from "../db/repos/videos.js";
import { batchFetchVideoDetails } from "../services/videoBatchFetcher.js";
import { fetchTranscript } from "../services/transcript.js";
import { upsertTranscript } from "../db/repos/transcripts.js";
import type { FetchVideoOutcome, TranscriptStatus } from "./get-video-details.js";

interface PlaylistItemSnippet {
  title: string;
  description: string;
  publishedAt: string;
  position: number;
  videoOwnerChannelTitle?: string;
  videoOwnerChannelId?: string;
  resourceId: { kind: string; videoId: string };
}

interface PlaylistItemRaw {
  id: string;
  snippet: PlaylistItemSnippet;
  contentDetails: {
    videoId: string;
    videoPublishedAt?: string;
  };
}

export function registerGetPlaylistItemsTool(server: McpServer): void {
  server.tool(
    "get_playlist_items",
    "Canonical playlist fetch entrypoint. Fetches all videos from a YouTube playlist by its ID. With hydrate=true (default), sequentially fetches and upserts metadata + transcript for every item via get_video_details. With hydrate=false, behaves as a list-only operation. Requires OAuth credentials (YOUTUBE_OAUTH_TOKEN_PATH).",
    {
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
        .describe(
          "When true (default), sequentially call get_video_details(includeTranscript=true) for every playlist item, upserting both metadata and transcripts. When false, only list and upsert playlist/video rows with the thin data from playlistItems.list."
        ),
    },
    async ({ playlistId, maxResults, hydrate }) => {
      const items: PlaylistItemRaw[] = [];
      let pageToken: string | undefined;

      do {
        const params: Record<string, string> = {
          part: "snippet,contentDetails",
          playlistId,
          maxResults: String(Math.min(50, maxResults - items.length)),
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await fetchOAuthApi("playlistItems", params);
        const batch = (data.items as PlaylistItemRaw[]) ?? [];
        items.push(...batch);

        const next = data.nextPageToken as string | undefined;
        pageToken = items.length < maxResults ? next : undefined;
      } while (pageToken);

      if (items.length === 0) {
        return {
          content: [{ type: "text", text: `No videos found in playlist ${playlistId}.` }],
        };
      }

      try {
        const db = getDb();
        upsertPlaylistItems(
          db,
          items.map((item) => ({
            playlistItemId: item.id,
            playlistId,
            videoId: item.contentDetails.videoId,
            position: item.snippet.position,
            title: item.snippet.title,
            channelTitle: item.snippet.videoOwnerChannelTitle ?? null,
            videoPublishedAt: item.contentDetails.videoPublishedAt ?? null,
          }))
        );
        if (!hydrate) {
          // Thin upsert — only the data we have from playlistItems.list
          for (const item of items) {
            upsertVideo(
              db,
              {
                videoId: item.contentDetails.videoId,
                title: item.snippet.title,
                channelTitle: item.snippet.videoOwnerChannelTitle,
                description: item.snippet.description,
                publishedAt: item.contentDetails.videoPublishedAt ?? item.snippet.publishedAt,
              },
              "playlist_items"
            );
          }
        }
      } catch (err) {
        process.stderr.write(
          `youtube-mcp: DB upsert failed (get_playlist_items): ${err}\n`
        );
      }

      // Hydrate pass — batch-fetch all video metadata (50 IDs per videos.list call),
      // then fetch transcripts per-video sequentially. Partial failures are tolerated.
      const hydrationOutcomes: Array<{
        videoId: string;
        metadata: "ok" | "failed";
        transcript: FetchVideoOutcome["transcript"];
        reason?: string;
      }> = [];
      if (hydrate) {
        const videoIds = items.map((item) => item.contentDetails.videoId);

        // Step 1: batch metadata fetch — ceil(N/50) videos.list calls
        const detailsMap = new Map<string, FetchVideoOutcome["details"]>();
        const metadataFailures = new Set<string>();
        try {
          const allDetails = await batchFetchVideoDetails(videoIds);
          const db = getDb();
          for (const details of allDetails) {
            detailsMap.set(details.videoId, details);
            try {
              upsertVideo(db, details, "get_playlist_items");
            } catch (err) {
              process.stderr.write(
                `youtube-mcp: DB upsert failed for ${details.videoId}: ${err}\n`
              );
            }
          }
          // Mark any IDs not returned by the API as failed
          for (const id of videoIds) {
            if (!detailsMap.has(id)) {
              metadataFailures.add(id);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `youtube-mcp: batch metadata fetch failed: ${message}\n`
          );
          // All IDs failed at batch level
          for (const id of videoIds) {
            metadataFailures.add(id);
          }
        }

        // Step 2: per-video transcript fetch (sequential to avoid hammering InnerTube)
        for (const videoId of videoIds) {
          if (metadataFailures.has(videoId)) {
            hydrationOutcomes.push({
              videoId,
              metadata: "failed",
              transcript: "skipped",
              reason: "metadata fetch failed",
            });
            continue;
          }

          let transcriptStatus: TranscriptStatus = "skipped";
          let transcriptReason: string | undefined;

          try {
            const transcript = await fetchTranscript(videoId);
            try {
              upsertTranscript(getDb(), transcript);
            } catch (err) {
              process.stderr.write(
                `youtube-mcp: DB upsert failed (transcript) for ${videoId}: ${err}\n`
              );
            }
            transcriptStatus = "ok";
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const lower = message.toLowerCase();
            if (
              lower.includes("no captions") ||
              lower.includes("captions disabled") ||
              lower.includes("not available") ||
              lower.includes("http 404")
            ) {
              transcriptStatus = "missing";
            } else if (
              lower.includes("transcripts disabled") ||
              lower.includes("captions are disabled")
            ) {
              transcriptStatus = "unavailable";
            } else {
              transcriptStatus = "failed";
            }
            transcriptReason = message;
            process.stderr.write(
              `youtube-mcp: transcript fetch ${transcriptStatus} for ${videoId}: ${message}\n`
            );
          }

          hydrationOutcomes.push({
            videoId,
            metadata: "ok",
            transcript: transcriptStatus,
            reason: transcriptReason,
          });
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
        parts.push(
          ``,
          `Hydration statuses (${hydrationOutcomes.length} items):`,
          ...statusLines
        );
      }

      return {
        content: [{ type: "text", text: parts.join("\n") }],
      };
    }
  );
}
