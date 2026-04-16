/**
 * String-literal union types for video ingest status columns.
 * Used in the `videos` table and tool response schemas.
 */
/**
 * Maps a tool-layer transcript status to the DB-persisted value.
 * - "unavailable" → "failed"  (captions exist but access is blocked)
 * - "skipped"     → "pending" (transcript fetch was not attempted)
 * All other values are already valid DB values and pass through unchanged.
 */
export function toDbTranscriptStatus(s) {
    if (s === "unavailable")
        return "failed";
    if (s === "skipped")
        return "pending";
    return s;
}
//# sourceMappingURL=status.js.map