/**
 * String-literal union types for video ingest status columns.
 * Used in the `videos` table and tool response schemas.
 */

/** Status of the metadata fetch for a video. */
export type MetadataStatus = "ok" | "pending" | "failed";

/** Status of the transcript fetch for a video. */
export type TranscriptStatus = "ok" | "pending" | "missing" | "failed";
