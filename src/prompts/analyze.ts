import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerAnalyzePrompt(server: McpServer): void {
  server.prompt(
    "analyze",
    "Perform a deep content analysis of a YouTube video",
    { url: z.string().describe("YouTube video URL or ID") },
    async ({ url }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Please perform a deep analysis of the YouTube video: ${url}`,
              ``,
              `Use the following tools:`,
              `1. analyze_video — to get themes, sentiment, and key moments`,
              `2. get_transcript — to read the full transcript`,
              ``,
              `Then provide:`,
              `1. **Content Categorization** — What type of content this is and who it's for`,
              `2. **Key Themes & Arguments** — The main ideas and how they're structured`,
              `3. **Audience Sentiment** — What commenters think (positive/negative themes)`,
              `4. **Factual Claims** — Notable claims made that could be fact-checked`,
              `5. **Content Quality** — Production quality, depth, accuracy, and presentation style`,
              `6. **Comparison** — How this compares to typical content in its category`,
            ].join("\n"),
          },
        },
      ],
    })
  );
}
