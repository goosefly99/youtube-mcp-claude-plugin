import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type FetchVideoOutcome } from "./get-video-details.js";
/**
 * Transcript fetches in the hydrate pass are deliberately serial (concurrency=1)
 * to avoid hammering InnerTube. This constant documents the intent and makes it
 * easy to find if the policy changes.
 */
export declare const HYDRATE_TRANSCRIPT_CONCURRENCY = 1;
/**
 * Machine-friendly summary of a hydrated playlist response.
 * Emitted as an additive top-level field in the get_playlist_items response
 * (see docs/transcript-retry-semantics.md for retry rules).
 */
export interface PlaylistHydrationSummary {
    total: number;
    metadataOk: number;
    transcriptOk: number;
    transcriptMissing: number;
    transcriptFailed: number;
}
export interface HydrationOutcome {
    videoId: string;
    metadata: "ok" | "failed";
    transcript: FetchVideoOutcome["transcript"];
    reason?: string;
}
/**
 * Build the additive summary block for a hydrated playlist response.
 *
 * Downstream orchestrator skills may still rely on the existing text output;
 * this summary is additive only.
 */
export declare function buildPlaylistSummary(outcomes: HydrationOutcome[]): PlaylistHydrationSummary;
export declare function registerGetPlaylistItemsTool(server: McpServer): void;
