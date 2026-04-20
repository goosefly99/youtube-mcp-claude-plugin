/**
 * Tests for the additive summary block on the get_playlist_items response.
 *
 * buildPlaylistSummary is a pure function that derives a
 * PlaylistHydrationSummary from the hydration outcomes. This test exercises
 * that function with a 4-item mixed-outcome scenario (2 ok, 1 missing, 1
 * failed) — the same shape that a real hydrate loop would produce when
 * transcript fetches return mixed results.
 *
 * Acceptance: summary === { total: 4, metadataOk: 4, transcriptOk: 2,
 *                          transcriptMissing: 1, transcriptFailed: 1 }.
 *
 * This does NOT exercise the full registerGetPlaylistItemsTool path (which
 * requires OAuth credentials) — instead it validates the summary-building
 * contract on realistic outcome shapes. The summary code path in the tool
 * is a direct call to buildPlaylistSummary, so this is a tight contract
 * check that also catches drift if the summary fields ever diverge.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlaylistSummary,
  type HydrationOutcome,
} from "../tools/get-playlist-items.js";

describe("playlist summary (get_playlist_items.summary block)", () => {
  it("builds summary = {total:4, metadataOk:4, transcriptOk:2, transcriptMissing:1, transcriptFailed:1}", () => {
    const outcomes: HydrationOutcome[] = [
      { videoId: "ok1", metadata: "ok", transcript: "ok" },
      { videoId: "ok2", metadata: "ok", transcript: "ok" },
      {
        videoId: "miss1",
        metadata: "ok",
        transcript: "missing",
        reason: "no-captions",
      },
      {
        videoId: "fail1",
        metadata: "ok",
        transcript: "failed",
        reason: "HTTP 500 upstream",
      },
    ];

    const summary = buildPlaylistSummary(outcomes);

    assert.deepStrictEqual(summary, {
      total: 4,
      metadataOk: 4,
      transcriptOk: 2,
      transcriptMissing: 1,
      transcriptFailed: 1,
    });
  });

  it("handles all-ok playlist", () => {
    const outcomes: HydrationOutcome[] = Array.from({ length: 3 }, (_, i) => ({
      videoId: `v${i}`,
      metadata: "ok",
      transcript: "ok",
    }));
    const summary = buildPlaylistSummary(outcomes);
    assert.deepStrictEqual(summary, {
      total: 3,
      metadataOk: 3,
      transcriptOk: 3,
      transcriptMissing: 0,
      transcriptFailed: 0,
    });
  });

  it("handles all-metadata-failed playlist", () => {
    const outcomes: HydrationOutcome[] = [
      { videoId: "f1", metadata: "failed", transcript: "skipped" },
      { videoId: "f2", metadata: "failed", transcript: "skipped" },
    ];
    const summary = buildPlaylistSummary(outcomes);
    assert.deepStrictEqual(summary, {
      total: 2,
      metadataOk: 0,
      transcriptOk: 0,
      transcriptMissing: 0,
      transcriptFailed: 0,
    });
  });

  it("handles empty outcomes", () => {
    const summary = buildPlaylistSummary([]);
    assert.deepStrictEqual(summary, {
      total: 0,
      metadataOk: 0,
      transcriptOk: 0,
      transcriptMissing: 0,
      transcriptFailed: 0,
    });
  });
});
