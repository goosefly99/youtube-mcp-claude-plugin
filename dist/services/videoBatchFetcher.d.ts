/**
 * Batch fetcher for YouTube videos.list API.
 *
 * The YouTube Data API v3 `videos.list` endpoint accepts up to 50 video IDs
 * per request. This module chunks an arbitrary list of IDs into groups of 50
 * and issues one API call per chunk, collecting the results.
 *
 * Quota note: each `videos.list` call costs 1 quota unit regardless of how
 * many IDs are in the `id` parameter (up to 50). Batching 50 IDs per call
 * is therefore always quota-optimal. For a playlist of N videos, the number
 * of `videos.list` calls is ceil(N / 50).
 */
import type { VideoDetails } from "../types.js";
export declare const BATCH_SIZE = 50;
/** Signature for the function that performs one `videos.list` network call. */
export type VideoListFetcher = (ids: string[]) => Promise<VideoDetails[]>;
/** Result shape returned by batchFetchVideoDetails. */
export interface BatchFetchResult {
    /** Map from videoId → VideoDetails for all successfully fetched videos. */
    details: Map<string, VideoDetails>;
    /** One entry per chunk that threw, listing the IDs in that chunk and the error reason. */
    failures: Array<{
        videoIds: string[];
        reason: string;
    }>;
}
/**
 * Default implementation: calls the YouTube Data API v3 `videos.list` endpoint
 * with part=snippet,contentDetails,statistics for the given IDs.
 */
export declare function fetchVideoBatch(ids: string[]): Promise<VideoDetails[]>;
/**
 * Fetch VideoDetails for a list of video IDs, issuing one `videos.list` call
 * per chunk of up to BATCH_SIZE (50) IDs.
 *
 * Per-chunk failures are isolated: a chunk that throws is recorded in the
 * returned `failures` array while successfully completed chunks are still
 * present in the returned `details` Map. The caller decides how to handle
 * partial failures.
 *
 * @param videoIds  List of bare YouTube video IDs.
 * @param fetcher   Optional override for the batch API call (used in tests).
 * @returns         `{ details, failures }` — see BatchFetchResult.
 */
export declare function batchFetchVideoDetails(videoIds: string[], fetcher?: VideoListFetcher): Promise<BatchFetchResult>;
