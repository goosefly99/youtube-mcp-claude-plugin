/**
 * Tests for get_new_playlist_items helpers.
 *
 * Three test groups:
 *   1. decideHydration — pure predicate covering every persisted-state branch
 *      laid out in docs/transcript-retry-semantics.md.
 *   2. buildNewPlaylistItemsSummary — pure summary roll-up across mixed
 *      candidate outcomes.
 *   3. getVideoHydrationStates — round-trips through an in-memory SQLite DB
 *      to confirm the diff query honours metadata_status, transcript_status,
 *      and the hasTranscriptRow EXISTS subquery.
 *
 * The full registerGetNewPlaylistItemsTool path is not exercised here — it
 * requires OAuth + the YouTube API. Those branches are covered indirectly
 * via the helpers that drive its behavior.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { initSchema } from "../db/schema.js";
import { upsertVideo, getVideoHydrationStates, } from "../db/repos/videos.js";
import { upsertTranscript } from "../db/repos/transcripts.js";
import { decideHydration, buildNewPlaylistItemsSummary, } from "../tools/get-new-playlist-items.js";
function makeInMemoryDb() {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    return db;
}
function state(overrides) {
    return {
        videoId: "v1",
        hasVideoRow: false,
        metadataStatus: null,
        hasTranscriptRow: false,
        transcriptStatus: null,
        ...overrides,
    };
}
describe("decideHydration", () => {
    it("no videos row → needsHydrate=true, reason=no-video-row", () => {
        const d = decideHydration(state({ hasVideoRow: false }));
        assert.deepStrictEqual(d, { needsHydrate: true, reason: "no-video-row" });
    });
    it("metadata_status null → needsHydrate=true, reason=metadata-incomplete", () => {
        const d = decideHydration(state({ hasVideoRow: true, metadataStatus: null }));
        assert.deepStrictEqual(d, {
            needsHydrate: true,
            reason: "metadata-incomplete",
        });
    });
    it("metadata_status pending → needsHydrate=true, reason=metadata-incomplete", () => {
        const d = decideHydration(state({ hasVideoRow: true, metadataStatus: "pending" }));
        assert.deepStrictEqual(d, {
            needsHydrate: true,
            reason: "metadata-incomplete",
        });
    });
    it("metadata_status failed → needsHydrate=true, reason=metadata-incomplete", () => {
        const d = decideHydration(state({ hasVideoRow: true, metadataStatus: "failed" }));
        assert.deepStrictEqual(d, {
            needsHydrate: true,
            reason: "metadata-incomplete",
        });
    });
    it("metadata ok + transcripts row present → skip, reason=complete", () => {
        const d = decideHydration(state({
            hasVideoRow: true,
            metadataStatus: "ok",
            hasTranscriptRow: true,
            transcriptStatus: "ok",
        }));
        assert.deepStrictEqual(d, { needsHydrate: false, reason: "complete" });
    });
    it("metadata ok + transcript_status='ok' but no row → still complete (trust status)", () => {
        const d = decideHydration(state({
            hasVideoRow: true,
            metadataStatus: "ok",
            hasTranscriptRow: false,
            transcriptStatus: "ok",
        }));
        assert.deepStrictEqual(d, { needsHydrate: false, reason: "complete" });
    });
    it("metadata ok + transcript_status='missing' → skip, terminal verdict", () => {
        const d = decideHydration(state({
            hasVideoRow: true,
            metadataStatus: "ok",
            hasTranscriptRow: false,
            transcriptStatus: "missing",
        }));
        assert.deepStrictEqual(d, {
            needsHydrate: false,
            reason: "missing-no-captions",
        });
    });
    it("metadata ok + transcript_status='failed' → retryable", () => {
        const d = decideHydration(state({
            hasVideoRow: true,
            metadataStatus: "ok",
            hasTranscriptRow: false,
            transcriptStatus: "failed",
        }));
        assert.deepStrictEqual(d, {
            needsHydrate: true,
            reason: "transcript-retryable",
        });
    });
    it("metadata ok + transcript_status null → retryable", () => {
        const d = decideHydration(state({
            hasVideoRow: true,
            metadataStatus: "ok",
            hasTranscriptRow: false,
            transcriptStatus: null,
        }));
        assert.deepStrictEqual(d, {
            needsHydrate: true,
            reason: "transcript-retryable",
        });
    });
    it("metadata ok + transcript_status='pending' → retryable", () => {
        const d = decideHydration(state({
            hasVideoRow: true,
            metadataStatus: "ok",
            hasTranscriptRow: false,
            transcriptStatus: "pending",
        }));
        assert.deepStrictEqual(d, {
            needsHydrate: true,
            reason: "transcript-retryable",
        });
    });
});
describe("buildNewPlaylistItemsSummary", () => {
    it("rolls mixed outcomes into the structured summary", () => {
        const outcomes = [
            { videoId: "a", metadata: "ok", transcript: "ok" },
            { videoId: "b", metadata: "ok", transcript: "ok" },
            { videoId: "c", metadata: "ok", transcript: "missing", reason: "no-captions" },
            { videoId: "d", metadata: "ok", transcript: "failed", reason: "5xx" },
            {
                videoId: "e",
                metadata: "failed",
                transcript: "skipped",
                reason: "metadata fetch failed",
            },
        ];
        const summary = buildNewPlaylistItemsSummary(10, 5, 5, outcomes);
        assert.deepStrictEqual(summary, {
            total: 10,
            alreadyComplete: 5,
            candidates: 5,
            hydrated: 5,
            hydrationOk: 2,
            hydrationMissing: 1,
            hydrationFailed: 2, // one transcript=failed, one metadata=failed
        });
    });
    it("hydrate=false path (zero outcomes)", () => {
        const summary = buildNewPlaylistItemsSummary(10, 5, 5, []);
        assert.deepStrictEqual(summary, {
            total: 10,
            alreadyComplete: 5,
            candidates: 5,
            hydrated: 0,
            hydrationOk: 0,
            hydrationMissing: 0,
            hydrationFailed: 0,
        });
    });
    it("empty playlist", () => {
        const summary = buildNewPlaylistItemsSummary(0, 0, 0, []);
        assert.deepStrictEqual(summary, {
            total: 0,
            alreadyComplete: 0,
            candidates: 0,
            hydrated: 0,
            hydrationOk: 0,
            hydrationMissing: 0,
            hydrationFailed: 0,
        });
    });
});
describe("getVideoHydrationStates", () => {
    let db;
    before(() => {
        db = makeInMemoryDb();
        initSchema(db);
        // truly-new: nothing inserted for "new001"
        // metadata-only, no transcript row, no transcript_status (retryable)
        upsertVideo(db, { videoId: "meta_only" }, "test", {
            metadataStatus: "ok",
        });
        // metadata + transcripts row (complete)
        upsertVideo(db, { videoId: "complete" }, "test", {
            metadataStatus: "ok",
            transcriptStatus: "ok",
        });
        upsertTranscript(db, {
            videoId: "complete",
            language: "en",
            isAutoGenerated: false,
            segments: [{ text: "hi", start: 0, duration: 1 }],
            fullText: "hi",
        });
        // metadata + transcript_status='missing' (terminal, no row)
        upsertVideo(db, { videoId: "no_captions" }, "test", {
            metadataStatus: "ok",
            transcriptStatus: "missing",
            transcriptReason: "captions disabled",
        });
        // metadata + transcript_status='failed' (retryable)
        upsertVideo(db, { videoId: "transient_fail" }, "test", {
            metadataStatus: "ok",
            transcriptStatus: "failed",
            transcriptReason: "5xx",
        });
    });
    it("reports hasVideoRow=false for unknown ids", () => {
        const states = getVideoHydrationStates(db, ["new001"]);
        const s = states.get("new001");
        assert.strictEqual(s.hasVideoRow, false);
        assert.strictEqual(s.hasTranscriptRow, false);
        assert.strictEqual(s.metadataStatus, null);
        assert.strictEqual(s.transcriptStatus, null);
    });
    it("reports metadata-only state", () => {
        const states = getVideoHydrationStates(db, ["meta_only"]);
        const s = states.get("meta_only");
        assert.strictEqual(s.hasVideoRow, true);
        assert.strictEqual(s.metadataStatus, "ok");
        assert.strictEqual(s.hasTranscriptRow, false);
        assert.strictEqual(s.transcriptStatus, null);
    });
    it("reports complete state (videos + transcripts row)", () => {
        const states = getVideoHydrationStates(db, ["complete"]);
        const s = states.get("complete");
        assert.strictEqual(s.hasVideoRow, true);
        assert.strictEqual(s.metadataStatus, "ok");
        assert.strictEqual(s.hasTranscriptRow, true);
        assert.strictEqual(s.transcriptStatus, "ok");
    });
    it("reports terminal no-captions state", () => {
        const states = getVideoHydrationStates(db, ["no_captions"]);
        const s = states.get("no_captions");
        assert.strictEqual(s.hasVideoRow, true);
        assert.strictEqual(s.transcriptStatus, "missing");
        assert.strictEqual(s.hasTranscriptRow, false);
    });
    it("reports retryable failed state", () => {
        const states = getVideoHydrationStates(db, ["transient_fail"]);
        const s = states.get("transient_fail");
        assert.strictEqual(s.hasVideoRow, true);
        assert.strictEqual(s.transcriptStatus, "failed");
        assert.strictEqual(s.hasTranscriptRow, false);
    });
    it("returns one entry per requested id even when mixed with unknowns", () => {
        const states = getVideoHydrationStates(db, [
            "complete",
            "new001",
            "meta_only",
        ]);
        assert.strictEqual(states.size, 3);
        assert.strictEqual(states.get("complete").hasVideoRow, true);
        assert.strictEqual(states.get("new001").hasVideoRow, false);
        assert.strictEqual(states.get("meta_only").hasVideoRow, true);
    });
    it("integrates with decideHydration to produce the diff set", () => {
        const candidates = [
            "new001",
            "meta_only",
            "complete",
            "no_captions",
            "transient_fail",
        ];
        const states = getVideoHydrationStates(db, candidates);
        const needs = candidates.filter((id) => decideHydration(states.get(id)).needsHydrate);
        assert.deepStrictEqual(needs, ["new001", "meta_only", "transient_fail"]);
    });
    it("handles empty input without issuing a query", () => {
        const states = getVideoHydrationStates(db, []);
        assert.strictEqual(states.size, 0);
    });
});
//# sourceMappingURL=getNewPlaylistItems.test.js.map