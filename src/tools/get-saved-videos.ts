import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db/connection.js";
import { queryVideos } from "../db/repos/videos.js";
import type { VideoRow } from "../db/types.js";

function formatSavedVideo(v: VideoRow): string {
  const date = v.published_at
    ? new Date(v.published_at).toLocaleDateString()
    : "N/A";
  const savedAt = new Date(v.saved_at).toLocaleDateString();
  const views = v.view_count != null ? v.view_count.toLocaleString() : "N/A";
  const likes = v.like_count != null ? v.like_count.toLocaleString() : "N/A";
  const tags = v.tags_json ? (JSON.parse(v.tags_json) as string[]).join(", ") : "";

  const lines = [
    `--- ${v.title ?? v.video_id} ---`,
    `URL: https://youtube.com/watch?v=${v.video_id}`,
    v.channel_title ? `Channel: ${v.channel_title}` : "",
    v.duration ? `Duration: ${v.duration}` : "",
    `Published: ${date} | Views: ${views} | Likes: ${likes}`,
    `Saved: ${savedAt} [${v.source ?? "unknown"}]`,
    tags ? `Tags: ${tags}` : "",
    v.description ? `\n${v.description.slice(0, 300)}${v.description.length > 300 ? "..." : ""}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function registerGetSavedVideosTool(server: McpServer): void {
  server.tool(
    "get_saved_videos",
    "Failsafe: query locally cached YouTube videos without an API call. The database is populated automatically when other tools (search_videos, get_video_details, etc.) fetch from the YouTube API — use this only as a fallback to avoid redundant API requests or when working offline.",
    {
      query: z
        .string()
        .optional()
        .describe("Text search in title and description"),
      channel: z
        .string()
        .optional()
        .describe("Filter by channel title (partial match)"),
      source: z
        .string()
        .optional()
        .describe(
          "Filter by source tool: 'search' | 'get_video_details' | 'playlist_items'"
        ),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .describe("Number of results (1-100, default 20)"),
      offset: z
        .number()
        .min(0)
        .default(0)
        .describe("Pagination offset (default 0)"),
    },
    async ({ query, channel, source, limit, offset }) => {
      let videos: VideoRow[];
      try {
        videos = queryVideos(getDb(), { query, channel, source, limit, offset });
      } catch (err) {
        process.stderr.write(
          `youtube-mcp: DB query failed (get_saved_videos): ${err}\n`
        );
        return {
          content: [
            {
              type: "text",
              text: "Database query failed. The DB may not be initialized yet.",
            },
          ],
        };
      }

      if (videos.length === 0) {
        const filters = [
          query ? `query="${query}"` : "",
          channel ? `channel="${channel}"` : "",
          source ? `source="${source}"` : "",
        ]
          .filter(Boolean)
          .join(", ");
        const msg = filters
          ? `No saved videos found matching ${filters}.`
          : "No saved videos found.";
        return { content: [{ type: "text", text: msg }] };
      }

      const formatted = videos.map(formatSavedVideo).join("\n\n");
      return {
        content: [
          {
            type: "text",
            text: `${videos.length} saved video(s) (offset ${offset}):\n\n${formatted}`,
          },
        ],
      };
    }
  );
}
