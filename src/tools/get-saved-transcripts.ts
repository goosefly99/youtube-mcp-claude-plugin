import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db/connection.js";
import { queryTranscripts } from "../db/repos/transcripts.js";
import type { TranscriptRow } from "../db/types.js";

function formatSavedTranscript(t: TranscriptRow, snippetLen: number): string {
  const savedAt = new Date(t.saved_at).toLocaleDateString();
  const auto = t.is_auto_generated ? " (auto-generated)" : " (manual)";
  const textLen = t.full_text?.length ?? 0;
  const snippet = t.full_text
    ? t.full_text.slice(0, snippetLen) +
      (t.full_text.length > snippetLen ? "..." : "")
    : "(empty)";

  return [
    `--- ${t.video_id} [${t.language}${auto}] ---`,
    `URL: https://youtube.com/watch?v=${t.video_id}`,
    `Saved: ${savedAt} | Length: ${textLen} chars`,
    "",
    snippet,
  ].join("\n");
}

export function registerGetSavedTranscriptsTool(server: McpServer): void {
  server.tool(
    "get_saved_transcripts",
    "Failsafe: query locally cached YouTube transcripts without an API call. The database is populated automatically when get_transcript fetches from the YouTube API — use this only as a fallback to avoid redundant API requests or when working offline.",
    {
      query: z
        .string()
        .optional()
        .describe("Full-text search in transcript content"),
      language: z
        .string()
        .optional()
        .describe("Filter by language code (e.g. 'en')"),
      snippetLength: z
        .number()
        .min(100)
        .max(20000)
        .default(500)
        .describe("How many characters of each transcript to include (default 500)"),
      limit: z
        .number()
        .min(1)
        .max(50)
        .default(10)
        .describe("Number of results (1-50, default 10)"),
      offset: z
        .number()
        .min(0)
        .default(0)
        .describe("Pagination offset (default 0)"),
    },
    async ({ query, language, snippetLength, limit, offset }) => {
      let rows: TranscriptRow[];
      try {
        rows = queryTranscripts(getDb(), { query, language, limit, offset });
      } catch (err) {
        process.stderr.write(
          `youtube-mcp: DB query failed (get_saved_transcripts): ${err}\n`
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

      if (rows.length === 0) {
        const msg = query
          ? `No saved transcripts found matching "${query}".`
          : "No saved transcripts found.";
        return { content: [{ type: "text", text: msg }] };
      }

      const formatted = rows
        .map((r) => formatSavedTranscript(r, snippetLength))
        .join("\n\n");
      return {
        content: [
          {
            type: "text",
            text: `${rows.length} saved transcript(s) (offset ${offset}):\n\n${formatted}`,
          },
        ],
      };
    }
  );
}
