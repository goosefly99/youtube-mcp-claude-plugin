/**
 * TDD tests for Y2: additive nullable status columns on the videos table.
 *
 * Acceptance criteria:
 * 1. initSchema() is idempotent — calling it twice on the same DB does not throw.
 * 2. After upsertVideo with explicit status values, the row contains those values.
 * 3. Fixture aDWJ6lLemJU: metadata_status='ok', transcript_status='missing'.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { initSchema } from "../db/schema.js";
import { upsertVideo } from "../db/repos/videos.js";

function makeInMemoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

describe("initSchema idempotency", () => {
  it("calling initSchema twice on the same DB does not throw", () => {
    const db = makeInMemoryDb();
    assert.doesNotThrow(() => initSchema(db), "first call should not throw");
    assert.doesNotThrow(() => initSchema(db), "second call should not throw");
  });
});

describe("status columns on videos table", () => {
  let db: DatabaseSync;

  before(() => {
    db = makeInMemoryDb();
    initSchema(db);
  });

  it("upsertVideo stores metadata_status and transcript_status columns", () => {
    upsertVideo(db, { videoId: "test001" }, "test", {
      metadataStatus: "ok",
      transcriptStatus: "missing",
      transcriptReason: "no captions available",
    });

    const row = db
      .prepare("SELECT metadata_status, transcript_status, transcript_reason FROM videos WHERE video_id = ?")
      .get("test001") as { metadata_status: string; transcript_status: string; transcript_reason: string } | undefined;

    assert.ok(row, "row must exist");
    assert.strictEqual(row.metadata_status, "ok");
    assert.strictEqual(row.transcript_status, "missing");
    assert.strictEqual(row.transcript_reason, "no captions available");
  });

  it("upsertVideo allows null status fields (backward compat)", () => {
    upsertVideo(db, { videoId: "test002" }, "test");

    const row = db
      .prepare("SELECT metadata_status, transcript_status, transcript_reason FROM videos WHERE video_id = ?")
      .get("test002") as { metadata_status: string | null; transcript_status: string | null; transcript_reason: string | null } | undefined;

    assert.ok(row, "row must exist");
    assert.strictEqual(row.metadata_status, null);
    assert.strictEqual(row.transcript_status, null);
    assert.strictEqual(row.transcript_reason, null);
  });

  it("fixture aDWJ6lLemJU: metadata=ok, transcript=missing", () => {
    upsertVideo(db, { videoId: "aDWJ6lLemJU" }, "get_playlist_items", {
      metadataStatus: "ok",
      transcriptStatus: "missing",
      transcriptReason: "disabled by uploader",
    });

    const row = db
      .prepare("SELECT metadata_status, transcript_status, transcript_reason FROM videos WHERE video_id = ?")
      .get("aDWJ6lLemJU") as { metadata_status: string; transcript_status: string; transcript_reason: string } | undefined;

    assert.ok(row, "fixture row must exist");
    assert.strictEqual(row.metadata_status, "ok", "metadata_status must be ok");
    assert.strictEqual(row.transcript_status, "missing", "transcript_status must be missing");
    assert.strictEqual(row.transcript_reason, "disabled by uploader");
  });

  it("ON CONFLICT update preserves status when excluded value is non-null", () => {
    // Insert initial row
    upsertVideo(db, { videoId: "test003", title: "Original" }, "test", {
      metadataStatus: "ok",
      transcriptStatus: "pending",
    });

    // Re-upsert with updated transcript status
    upsertVideo(db, { videoId: "test003", title: "Updated" }, "test", {
      metadataStatus: "ok",
      transcriptStatus: "ok",
    });

    const row = db
      .prepare("SELECT transcript_status FROM videos WHERE video_id = ?")
      .get("test003") as { transcript_status: string } | undefined;

    assert.ok(row, "row must exist");
    assert.strictEqual(row.transcript_status, "ok", "transcript_status should be updated to ok");
  });

  it("COALESCE preserves existing metadata_status when upserted without status opts", () => {
    // Insert with explicit metadata_status='ok'
    upsertVideo(db, { videoId: "test004", title: "Initial" }, "test", {
      metadataStatus: "ok",
    });

    // Re-upsert same video_id with no status opts — COALESCE must keep 'ok'
    upsertVideo(db, { videoId: "test004", title: "Re-upsert" }, "test");

    const row = db
      .prepare("SELECT metadata_status, transcript_status FROM videos WHERE video_id = ?")
      .get("test004") as { metadata_status: string | null; transcript_status: string | null } | undefined;

    assert.ok(row, "row must exist");
    assert.strictEqual(row.metadata_status, "ok", "metadata_status must be preserved by COALESCE, not overwritten to null");
    assert.strictEqual(row.transcript_status, null, "transcript_status was never set, should remain null");
  });
});
