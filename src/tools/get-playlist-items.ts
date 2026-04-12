import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchOAuthApi } from "../services/youtube-oauth.js";
import { getDb } from "../db/connection.js";
import { upsertPlaylistItems } from "../db/repos/playlists.js";
import { upsertVideo } from "../db/repos/videos.js";

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
    "Fetch all videos from a YouTube playlist by its ID. Returns position, title, video URL, channel, and playlist item ID for each video. Requires OAuth credentials (YOUTUBE_OAUTH_TOKEN_PATH).",
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
    },
    async ({ playlistId, maxResults }) => {
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
      } catch (err) {
        process.stderr.write(
          `youtube-mcp: DB upsert failed (get_playlist_items): ${err}\n`
        );
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

      return {
        content: [
          {
            type: "text",
            text: `Playlist ${playlistId} — ${items.length} video(s):\n\n${formatted}`,
          },
        ],
      };
    }
  );
}
