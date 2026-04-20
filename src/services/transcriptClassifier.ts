/**
 * Transcript-error classifier — shared helper consolidating the two prior
 * inline error-matcher call sites:
 *
 *   1. src/tools/get-video-details.ts (catch block inside fetchAndStoreVideo)
 *   2. src/tools/get-playlist-items.ts (catch block inside the hydrate loop)
 *
 * Both previously classified transcript-fetch failures via an identical
 * three-substring check on the lowercased error message. This module is now
 * the single source of truth for that decision.
 *
 * Classification contract:
 *   - "no captions" / "captions disabled" → { status: "missing", reason: "no-captions" }
 *   - "http 404"                          → { status: "missing", reason: "http-404" }
 *   - everything else                     → { status: "failed", reason: <truncated message> }
 *
 * "missing" is a terminal verdict: the source lacks captions, do not retry.
 * "failed" is transient: callers MAY retry with backoff (no backoff is enforced here).
 */

import type { ToolTranscriptStatus } from "../types/status.js";

export interface TranscriptClassification {
  status: ToolTranscriptStatus;
  reason?: string;
}

export function classifyTranscriptError(err: unknown): TranscriptClassification {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();
  if (lower.includes("no captions") || lower.includes("captions disabled")) {
    return { status: "missing", reason: "no-captions" };
  }
  if (lower.includes("http 404")) {
    return { status: "missing", reason: "http-404" };
  }
  return { status: "failed", reason: message.slice(0, 200) };
}
