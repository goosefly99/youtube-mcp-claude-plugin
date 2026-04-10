import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerComparePrompt(server: McpServer): void {
  server.prompt(
    "compare",
    "Compare two or more YouTube videos side by side",
    {
      urls: z
        .string()
        .describe("Comma-separated YouTube video URLs or IDs"),
    },
    async ({ urls }) => {
      const videoList = urls
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Please compare these YouTube videos:`,
                ...videoList.map((u, i) => `${i + 1}. ${u}`),
                ``,
                `For each video, use:`,
                `1. get_video_details — to get metadata`,
                `2. get_transcript — to fetch transcripts`,
                ``,
                `Then provide:`,
                `1. **Metadata Comparison** — Side-by-side: duration, views, publish date, channel`,
                `2. **Topic Overlap** — What topics both videos cover`,
                `3. **Unique Coverage** — What each video covers that the other doesn't`,
                `4. **Perspectives** — How each video approaches the subject differently`,
                `5. **Depth Comparison** — Which video goes deeper on which subtopics`,
                `6. **Recommendation** — Which video to watch based on different viewer goals`,
              ].join("\n"),
            },
          },
        ],
      };
    }
  );
}
