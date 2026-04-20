/**
 * Tests for channel_id persistence via upsertVideo.
 *
 * Acceptance criteria:
 *   1. upsertVideo with VideoDetails.channelId = 'UCxyz123' writes 'UCxyz123' to videos.channel_id.
 *   2. upsertVideo with channelId = null persists NULL (no TypeError).
 *   3. COALESCE behavior: once channel_id is non-null, a subsequent null upsert does not overwrite it.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { initSchema } from "../db/schema.js";
import { upsertVideo } from "../db/repos/videos.js";
function makeInMemoryDb() {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    return db;
}
function makeDetails(overrides) {
    return {
        videoId: overrides.videoId ?? "test001",
        title: overrides.title ?? "Test title",
        channelId: overrides.channelId ?? null,
        channelTitle: overrides.channelTitle ?? "Test Channel",
        description: overrides.description ?? "",
        publishedAt: overrides.publishedAt ?? "2024-01-01T00:00:00Z",
        thumbnailUrl: overrides.thumbnailUrl ?? "",
        duration: overrides.duration ?? "5m",
        tags: overrides.tags ?? [],
        categoryId: overrides.categoryId ?? "22",
        defaultLanguage: overrides.defaultLanguage,
        statistics: overrides.statistics ?? {
            viewCount: "0",
            likeCount: "0",
            commentCount: "0",
        },
    };
}
describe("channel_id persistence", () => {
    let db;
    before(() => {
        db = makeInMemoryDb();
        initSchema(db);
    });
    it("persists non-null channelId into videos.channel_id", () => {
        const details = makeDetails({ videoId: "chanTest1", channelId: "UCxyz123" });
        upsertVideo(db, details, "test");
        const row = db
            .prepare("SELECT channel_id FROM videos WHERE video_id = ?")
            .get("chanTest1");
        assert.ok(row, "row must exist");
        assert.strictEqual(row.channel_id, "UCxyz123", "channel_id must be persisted");
    });
    it("persists null channelId as NULL without throwing", () => {
        const details = makeDetails({ videoId: "chanTest2", channelId: null });
        assert.doesNotThrow(() => upsertVideo(db, details, "test"));
        const row = db
            .prepare("SELECT channel_id FROM videos WHERE video_id = ?")
            .get("chanTest2");
        assert.ok(row, "row must exist");
        assert.strictEqual(row.channel_id, null, "channel_id must be null");
    });
    it("COALESCE preserves an already-populated channel_id when a null upsert follows", () => {
        // First upsert with channel_id set
        upsertVideo(db, makeDetails({ videoId: "chanTest3", channelId: "UCpreserved" }), "test");
        // Second upsert with channel_id null — should NOT overwrite the existing value
        upsertVideo(db, makeDetails({ videoId: "chanTest3", channelId: null }), "test");
        const row = db
            .prepare("SELECT channel_id FROM videos WHERE video_id = ?")
            .get("chanTest3");
        assert.ok(row, "row must exist");
        assert.strictEqual(row.channel_id, "UCpreserved", "channel_id must be preserved by COALESCE");
    });
});
//# sourceMappingURL=channelId.test.js.map