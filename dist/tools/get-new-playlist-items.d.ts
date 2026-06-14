import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type VideoHydrationState } from "../db/repos/videos.js";
import { type FetchVideoOutcome } from "./get-video-details.js";
/**
 * Per-video reason a candidate either needs hydration or can be skipped.
 *
 * @see ../../docs/transcript-retry-semantics.md for the persisted-status
 * retry table that drives "transcript-retryable" vs "missing-no-captions".
 *
 * @internal — exported for unit testing only.
 */
export type HydrationReason = "no-video-row" | "metadata-incomplete" | "transcript-retryable" | "complete" | "missing-no-captions";
/**
 * @internal — exported for unit testing only.
 */
export interface HydrationDecision {
    needsHydrate: boolean;
    reason: HydrationReason;
}
/**
 * Pure decision function: given a persisted hydration state, returns whether
 * this video should be (re)fetched.
 *
 * Predicate (see docs/transcript-retry-semantics.md):
 *   - No `videos` row                                                  → fetch
 *   - `metadata_status != 'ok'`                                        → fetch
 *   - Metadata ok and (transcripts row OR transcript_status='ok')      → skip
 *   - Metadata ok, no transcript, transcript_status='missing'          → skip (terminal)
 *   - Otherwise (transcript_status null/pending/failed)                → fetch (retryable)
 *
 * @internal — exported for unit testing only.
 */
export declare function decideHydration(state: VideoHydrationState): HydrationDecision;
/**
 * Machine-friendly summary of a get_new_playlist_items response.
 *
 * Field semantics:
 *   - total: live playlist size (after pagination, capped at maxResults)
 *   - alreadyComplete: count where decideHydration → needsHydrate=false
 *   - candidates: count where decideHydration → needsHydrate=true
 *   - hydrated: number of candidates the tool actually attempted to ingest
 *               (equals candidates when hydrate=true and 0 when hydrate=false)
 *   - hydrationOk / hydrationMissing / hydrationFailed: per-outcome counts
 *     across the hydrated set
 *
 * @internal — exported for unit testing only.
 */
export interface NewPlaylistItemsSummary {
    total: number;
    alreadyComplete: number;
    candidates: number;
    hydrated: number;
    hydrationOk: number;
    hydrationMissing: number;
    hydrationFailed: number;
}
/**
 * @internal — exported for unit testing only.
 */
export interface CandidateHydrationOutcome {
    videoId: string;
    metadata: "ok" | "failed";
    transcript: FetchVideoOutcome["transcript"];
    reason?: string;
}
/**
 * @internal — exported for unit testing only.
 */
export declare function buildNewPlaylistItemsSummary(total: number, alreadyComplete: number, candidates: number, outcomes: CandidateHydrationOutcome[]): NewPlaylistItemsSummary;
export declare function registerGetNewPlaylistItemsTool(server: McpServer): void;
