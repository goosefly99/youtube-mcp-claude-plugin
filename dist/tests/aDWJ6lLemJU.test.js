/**
 * Pinned fixture test for video id aDWJ6lLemJU — a known no-transcript case.
 *
 * Acceptance criteria:
 *   1. With the transcriptFetcher mocked to throw "No captions available",
 *      fetchAndStoreVideo('aDWJ6lLemJU', true) returns transcript='missing'
 *      and the DB row's transcript_status = 'missing'.
 *   2. The transcript fetcher is invoked exactly once — i.e. fetchAndStoreVideo
 *      does not retry the transcript fetch internally.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
// Route the singleton DB at import-time to a clean tmp file.
const tmpDbPath = path.join(os.tmpdir(), `yt-aDWJ6-${process.pid}-${Date.now()}.db`);
fs.writeFileSync(tmpDbPath, "");
process.env.YOUTUBE_MCP_DB_PATH = tmpDbPath;
const { initSchema } = await import("../db/schema.js");
const { getDb } = await import("../db/connection.js");
const { fetchAndStoreVideo } = await import("../tools/get-video-details.js");
function makeDetails(id) {
    return {
        videoId: id,
        title: `Title ${id}`,
        channelId: null,
        channelTitle: "Test Channel",
        description: "",
        publishedAt: "2024-01-01T00:00:00Z",
        thumbnailUrl: "",
        duration: "5m",
        tags: [],
        categoryId: "22",
        statistics: { viewCount: "0", likeCount: "0", commentCount: "0" },
    };
}
describe("aDWJ6lLemJU pinned no-transcript fixture", () => {
    before(() => {
        initSchema(getDb());
    });
    it("classifies 'No captions available' as missing and persists transcript_status='missing'", async () => {
        const videoId = "aDWJ6lLemJU";
        // Count transcript-fetcher invocations directly. The real invariant we want
        // to pin is "fetchAndStoreVideo does not retry the transcript fetch" —
        // measuring the fetcher itself is the correct observation point. (A prior
        // version of this test counted a wrapper around classifyTranscriptError,
        // but that only observed the proxy's own call, not fetchAndStoreVideo's
        // catch-block invocation at get-video-details.ts:129 — so it could never
        // have detected a retry.)
        let transcriptFetcherCalls = 0;
        const transcriptFetcher = async (_id) => {
            transcriptFetcherCalls += 1;
            throw new Error("No captions available");
        };
        const outcome = await fetchAndStoreVideo(videoId, true, {
            preFetchedDetails: makeDetails(videoId),
            source: "get_video_details",
            transcriptFetcher,
        });
        assert.strictEqual(outcome.videoId, videoId);
        assert.strictEqual(outcome.metadata, "ok");
        assert.strictEqual(outcome.transcript, "missing");
        // Transcript fetcher was invoked exactly once — proves no retry loop.
        assert.strictEqual(transcriptFetcherCalls, 1, "transcript fetcher must be invoked exactly once — no internal retry");
        const row = getDb()
            .prepare("SELECT transcript_status FROM videos WHERE video_id = ?")
            .get(videoId);
        assert.ok(row, "DB row must exist");
        assert.strictEqual(row.transcript_status, "missing", "transcript_status must be persisted as 'missing'");
    });
});
//# sourceMappingURL=aDWJ6lLemJU.test.js.map