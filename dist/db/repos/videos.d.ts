import type { DatabaseSync } from "node:sqlite";
import type { VideoSearchResult, VideoDetails } from "../../types.js";
import type { VideoRow } from "../types.js";
import type { MetadataStatus, TranscriptDbStatus } from "../../types/status.js";
export interface VideoStatusOpts {
    metadataStatus?: MetadataStatus | null;
    transcriptStatus?: TranscriptDbStatus | null;
    transcriptReason?: string | null;
}
export interface QueryVideosOpts {
    query?: string;
    channel?: string;
    source?: string;
    limit?: number;
    offset?: number;
}
/**
 * Upserts a single video row. Accepts either a partial search result or full
 * video details — fields that are unavailable on the search result are stored
 * as NULL and filled in later if get_video_details is called for the same id.
 *
 * The optional `status` parameter writes the three ingest-status columns
 * (metadata_status, transcript_status, transcript_reason). When omitted,
 * existing status values are preserved via COALESCE.
 */
export declare function upsertVideo(db: DatabaseSync, video: Partial<VideoDetails> & {
    videoId: string;
}, source: string, status?: VideoStatusOpts): void;
/**
 * Upserts a video row from a VideoSearchResult (partial data, no duration/tags).
 */
export declare function upsertSearchResult(db: DatabaseSync, result: VideoSearchResult, source: string): void;
export declare function upsertSearchResults(db: DatabaseSync, results: VideoSearchResult[], source: string): void;
/**
 * Query saved videos with optional filters. All filters use LIKE for partial
 * matches. Results are ordered by saved_at descending.
 */
export declare function queryVideos(db: DatabaseSync, opts?: QueryVideosOpts): VideoRow[];
