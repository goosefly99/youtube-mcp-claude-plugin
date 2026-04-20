/**
 * Tests for classifyTranscriptError — the shared transcript-error classifier
 * that replaces the identical substring matchers previously duplicated in
 * get-video-details.ts and get-playlist-items.ts.
 *
 * Acceptance criteria:
 *   1. "No captions available" → missing / no-captions
 *   2. "Captions disabled" → missing / no-captions
 *   3. "HTTP 404 transcript not found" → missing / http-404
 *   4. Unknown error → failed with truncated reason (≤200 chars)
 *   5. undefined err → failed without throwing
 *   6. Drift guard: identical inputs produce identical outputs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyTranscriptError } from "../services/transcriptClassifier.js";

describe("classifyTranscriptError", () => {
  it("classifies 'No captions available' as missing / no-captions", () => {
    const result = classifyTranscriptError(
      new Error("No captions available for video")
    );
    assert.strictEqual(result.status, "missing");
    assert.strictEqual(result.reason, "no-captions");
  });

  it("classifies 'Captions disabled' as missing / no-captions", () => {
    const result = classifyTranscriptError(
      new Error("Captions disabled on this video")
    );
    assert.strictEqual(result.status, "missing");
    assert.strictEqual(result.reason, "no-captions");
  });

  it("classifies 'HTTP 404' as missing / http-404", () => {
    const result = classifyTranscriptError(
      new Error("HTTP 404 transcript not found")
    );
    assert.strictEqual(result.status, "missing");
    assert.strictEqual(result.reason, "http-404");
  });

  it("classifies unknown errors as failed with truncated reason (≤200 chars)", () => {
    const longMessage = "x".repeat(500);
    const result = classifyTranscriptError(new Error(longMessage));
    assert.strictEqual(result.status, "failed");
    assert.ok(result.reason !== undefined, "reason must be present");
    assert.ok(
      (result.reason as string).length <= 200,
      `reason length must be ≤200, got ${(result.reason as string).length}`
    );
  });

  it("handles undefined err without throwing (safe failed fallback)", () => {
    assert.doesNotThrow(() => classifyTranscriptError(undefined));
    const result = classifyTranscriptError(undefined);
    assert.strictEqual(result.status, "failed");
  });

  it("handles null err without throwing", () => {
    assert.doesNotThrow(() => classifyTranscriptError(null));
    const result = classifyTranscriptError(null);
    assert.strictEqual(result.status, "failed");
  });

  it("handles non-Error values (string) via coercion", () => {
    const result = classifyTranscriptError("No captions available yadda yadda");
    assert.strictEqual(result.status, "missing");
    assert.strictEqual(result.reason, "no-captions");
  });

  it("is case-insensitive for matcher substrings", () => {
    const r1 = classifyTranscriptError(new Error("NO CAPTIONS AVAILABLE"));
    assert.strictEqual(r1.status, "missing");
    const r2 = classifyTranscriptError(new Error("Http 404 something"));
    assert.strictEqual(r2.status, "missing");
    assert.strictEqual(r2.reason, "http-404");
  });

  it("drift guard: running twice with the same fixture returns identical output", () => {
    const fixture = new Error("No captions available for video");
    const first = classifyTranscriptError(fixture);
    const second = classifyTranscriptError(fixture);
    assert.deepStrictEqual(
      first,
      second,
      "classifier must be deterministic — single source of truth"
    );
  });

  it("drift guard: unknown-error fixture is also deterministic", () => {
    const fixture = new Error("Something totally unexpected happened");
    const first = classifyTranscriptError(fixture);
    const second = classifyTranscriptError(fixture);
    assert.deepStrictEqual(first, second);
  });
});
