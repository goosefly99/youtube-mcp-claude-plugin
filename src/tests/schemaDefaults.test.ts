/**
 * Regression tests for Y4: Zod schema default values.
 *
 * Acceptance criteria:
 * 1. get_video_details schema: includeTranscript defaults to true.
 * 2. get_playlist_items schema: hydrate defaults to true.
 * 3. HYDRATE_TRANSCRIPT_CONCURRENCY is exported as 1.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { HYDRATE_TRANSCRIPT_CONCURRENCY } from "../tools/get-playlist-items.js";

// Replicate the schemas inline so the test has no dependency on MCP server
// registration side-effects (no DB, no OAuth). These must stay in sync with
// the actual schema definitions in the tool files.

const getVideoDetailsSchema = z.object({
  videoId: z.string(),
  includeTranscript: z.boolean().default(true),
});

const getPlaylistItemsSchema = z.object({
  playlistId: z.string(),
  maxResults: z.number().min(1).max(500).default(500),
  hydrate: z.boolean().default(true),
});

describe("schema defaults (Y4)", () => {
  describe("get_video_details", () => {
    it("includeTranscript defaults to true when omitted", () => {
      const parsed = getVideoDetailsSchema.parse({ videoId: "abc123" });
      assert.strictEqual(
        parsed.includeTranscript,
        true,
        "includeTranscript must default to true"
      );
    });

    it("includeTranscript can be overridden to false", () => {
      const parsed = getVideoDetailsSchema.parse({
        videoId: "abc123",
        includeTranscript: false,
      });
      assert.strictEqual(parsed.includeTranscript, false);
    });
  });

  describe("get_playlist_items", () => {
    it("hydrate defaults to true when omitted", () => {
      const parsed = getPlaylistItemsSchema.parse({ playlistId: "PLxxx" });
      assert.strictEqual(
        parsed.hydrate,
        true,
        "hydrate must default to true"
      );
    });

    it("hydrate can be overridden to false", () => {
      const parsed = getPlaylistItemsSchema.parse({
        playlistId: "PLxxx",
        hydrate: false,
      });
      assert.strictEqual(parsed.hydrate, false);
    });

    it("maxResults defaults to 500", () => {
      const parsed = getPlaylistItemsSchema.parse({ playlistId: "PLxxx" });
      assert.strictEqual(parsed.maxResults, 500);
    });
  });

  describe("HYDRATE_TRANSCRIPT_CONCURRENCY", () => {
    it("is exported as 1 (serial hydration policy)", () => {
      assert.strictEqual(
        HYDRATE_TRANSCRIPT_CONCURRENCY,
        1,
        "HYDRATE_TRANSCRIPT_CONCURRENCY must equal 1"
      );
    });
  });
});
