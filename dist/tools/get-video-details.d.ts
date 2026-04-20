import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VideoDetails } from "../types.js";
import type { ToolTranscriptStatus } from "../types/status.js";
export interface FetchVideoOutcome {
    videoId: string;
    details: VideoDetails;
    metadata: "ok" | "failed";
    transcript: ToolTranscriptStatus;
    transcriptReason?: string;
}
/**
 * Consolidated fetch for a single video: metadata + optional transcript in one call.
 *
 * Partial success is NOT a failure: if metadata succeeds but the transcript
 * cannot be retrieved (no captions, disabled, network error), the video row is
 * still upserted and the transcript status reflects the reason. Only a hard
 * metadata failure propagates as a thrown error — callers should surface that
 * to the user.
 */
export declare function fetchAndStoreVideo(videoId: string, includeTranscript: boolean): Promise<FetchVideoOutcome>;
export declare function registerGetVideoDetailsTool(server: McpServer): void;
