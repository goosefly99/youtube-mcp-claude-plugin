/**
 * String-literal union types for video ingest status columns.
 * Used in the `videos` table and tool response schemas.
 */
/** Status of the metadata fetch for a video. */
export type MetadataStatus = "ok" | "pending" | "failed";
/** Status values persisted to the DB transcript_status column. */
export type TranscriptDbStatus = "ok" | "pending" | "missing" | "failed";
/**
 * Tool-layer transcript status — superset of TranscriptDbStatus.
 * "unavailable" and "skipped" are in-memory states that never reach the DB;
 * they are mapped to DB values via toDbTranscriptStatus before any upsert.
 */
export type ToolTranscriptStatus = TranscriptDbStatus | "unavailable" | "skipped";
/**
 * Maps a tool-layer transcript status to the DB-persisted value.
 * - "unavailable" → "failed"  (captions exist but access is blocked)
 * - "skipped"     → "pending" (transcript fetch was not attempted)
 * All other values are already valid DB values and pass through unchanged.
 */
export declare function toDbTranscriptStatus(s: ToolTranscriptStatus): TranscriptDbStatus;
/**
 * @deprecated Use TranscriptDbStatus for DB-layer code.
 * Kept as a re-export alias for backward compatibility during migration.
 */
export type TranscriptStatus = TranscriptDbStatus;
