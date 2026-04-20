import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VideoDetails, Transcript } from "../types.js";
import type { ToolTranscriptStatus } from "../types/status.js";
/** Signature for the optional transcript fetcher override (test seam). */
export type TranscriptFetcher = (videoId: string) => Promise<Transcript>;
export interface FetchVideoOutcome {
    videoId: string;
    details: VideoDetails;
    metadata: "ok" | "failed";
    transcript: ToolTranscriptStatus;
    transcriptReason?: string;
}
export interface FetchAndStoreOpts {
    /**
     * Pre-fetched VideoDetails. When provided, fetchAndStoreVideo SKIPS its own
     * videos.list call and uses the supplied details. This lets batch callers
     * (e.g. the playlist hydrate loop) reuse a single batched videos.list result
     * across many videos without violating the 2*ceil(N/50) quota formula.
     */
    preFetchedDetails?: VideoDetails;
    /**
     * Source tag written to the `videos.source` DB column. Defaults to
     * "get_video_details" to preserve the historical behavior for the single-
     * video tool call site.
     */
    source?: string;
    /**
     * Optional override for the transcript fetcher. Defaults to the production
     * fetchTranscript. Provided as a test seam so unit tests can inject a mock
     * without depending on module-mocking experimental flags.
     */
    transcriptFetcher?: TranscriptFetcher;
}
/**
 * Consolidated fetch for a single video: metadata + optional transcript in one call.
 *
 * Partial success is NOT a failure: if metadata succeeds but the transcript
 * cannot be retrieved (missing captions, network error, etc.), the video row is
 * still upserted and the transcript status reflects the reason. Only a hard
 * metadata failure propagates as a thrown error — callers should surface that
 * to the user.
 *
 * Callers that have already batch-fetched metadata (playlist hydrate loop)
 * SHOULD pass `opts.preFetchedDetails` to avoid issuing an extra videos.list
 * call per video. This is what reunifies the playlist hydrate path through
 * this function while preserving the 2*ceil(N/50) quota invariant.
 */
export declare function fetchAndStoreVideo(videoId: string, includeTranscript: boolean, opts?: FetchAndStoreOpts): Promise<FetchVideoOutcome>;
export declare function registerGetVideoDetailsTool(server: McpServer): void;
