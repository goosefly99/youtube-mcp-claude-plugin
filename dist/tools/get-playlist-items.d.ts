import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Transcript fetches in the hydrate pass are deliberately serial (concurrency=1)
 * to avoid hammering InnerTube. This constant documents the intent and makes it
 * easy to find if the policy changes.
 */
export declare const HYDRATE_TRANSCRIPT_CONCURRENCY = 1;
export declare function registerGetPlaylistItemsTool(server: McpServer): void;
