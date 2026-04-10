import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchVideos } from "../services/youtube-api.js";

export function registerSearchVideosTool(server: McpServer): void {
  server.tool(
    "search_videos",
    "Search YouTube for videos matching a query. Returns titles, URLs, channels, view counts, and publish dates.",
    {
      query: z.string().describe("Search query describing the videos to find"),
      maxResults: z
        .number()
        .min(1)
        .max(25)
        .default(5)
        .describe("Number of results to return (1-25, default 5)"),
    },
    async ({ query, maxResults }) => {
      const results = await searchVideos(query, maxResults);

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No videos found for: "${query}"` }],
        };
      }

      const formatted = results
        .map((v, i) => {
          const views = v.viewCount
            ? Number(v.viewCount).toLocaleString()
            : "N/A";
          const date = new Date(v.publishedAt).toLocaleDateString();
          return [
            `${i + 1}. ${v.title}`,
            `   URL: https://youtube.com/watch?v=${v.videoId}`,
            `   Channel: ${v.channelTitle}`,
            `   Views: ${views} | Published: ${date}`,
            `   ${v.description.slice(0, 200)}${v.description.length > 200 ? "..." : ""}`,
          ].join("\n");
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} videos for "${query}":\n\n${formatted}`,
          },
        ],
      };
    }
  );
}
