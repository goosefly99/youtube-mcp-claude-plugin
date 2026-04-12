import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchOAuthApi } from "../services/youtube-oauth.js";
import { getDb } from "../db/connection.js";
import { upsertPlaylists } from "../db/repos/playlists.js";

interface PlaylistItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    itemCount?: number;
  };
  contentDetails?: {
    itemCount: number;
  };
}

export function registerListPlaylistsTool(server: McpServer): void {
  server.tool(
    "list_user_playlists",
    "List all playlists owned by the authenticated YouTube account. Requires OAuth credentials (YOUTUBE_OAUTH_TOKEN_PATH).",
    {
      maxResults: z
        .number()
        .min(1)
        .max(50)
        .default(50)
        .describe("Maximum number of playlists to return (1-50, default 50)"),
    },
    async ({ maxResults }) => {
      const playlists: PlaylistItem[] = [];
      let pageToken: string | undefined;

      do {
        const params: Record<string, string> = {
          part: "snippet,contentDetails",
          mine: "true",
          maxResults: String(maxResults),
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await fetchOAuthApi("playlists", params);
        const items = (data.items as PlaylistItem[]) ?? [];
        playlists.push(...items);

        const next = data.nextPageToken as string | undefined;
        pageToken = playlists.length < maxResults ? next : undefined;
      } while (pageToken);

      if (playlists.length === 0) {
        return {
          content: [{ type: "text", text: "No playlists found for this account." }],
        };
      }

      try {
        upsertPlaylists(
          getDb(),
          playlists.map((pl) => ({
            playlistId: pl.id,
            title: pl.snippet.title,
            description: pl.snippet.description,
            publishedAt: pl.snippet.publishedAt,
            itemCount: pl.contentDetails?.itemCount ?? null,
          }))
        );
      } catch (err) {
        process.stderr.write(
          `youtube-mcp: DB upsert failed (list_user_playlists): ${err}\n`
        );
      }

      const formatted = playlists
        .map((pl, i) => {
          const count = pl.contentDetails?.itemCount ?? "?";
          const date = new Date(pl.snippet.publishedAt).toLocaleDateString();
          const desc = pl.snippet.description
            ? `\n   ${pl.snippet.description.slice(0, 120)}${pl.snippet.description.length > 120 ? "..." : ""}`
            : "";
          return `${i + 1}. ${pl.snippet.title} (${count} videos)\n   ID: ${pl.id} | Created: ${date}${desc}`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${playlists.length} playlist(s):\n\n${formatted}`,
          },
        ],
      };
    }
  );
}
