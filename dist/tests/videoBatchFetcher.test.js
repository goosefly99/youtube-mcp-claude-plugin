/**
 * TDD test: batch videos.list call count for a 120-videoId playlist hydration.
 *
 * Acceptance criterion: hydrating 120 video IDs must invoke videos.list
 * exactly 3 times (chunks of 50, 50, 20).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { batchFetchVideoDetails } from "../services/videoBatchFetcher.js";
function makeFakeDetails(id) {
    return {
        videoId: id,
        title: `Title ${id}`,
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
describe("batchFetchVideoDetails", () => {
    it("issues exactly 3 videos.list calls for 120 video IDs (50+50+20)", async () => {
        let callCount = 0;
        const calledWithIds = [];
        // Stub fetcher: records call arguments and returns fake VideoDetails
        const stubFetcher = async (ids) => {
            callCount++;
            calledWithIds.push([...ids]);
            return ids.map(makeFakeDetails);
        };
        const videoIds = Array.from({ length: 120 }, (_, i) => `vid${String(i).padStart(3, "0")}`);
        const result = await batchFetchVideoDetails(videoIds, stubFetcher);
        assert.strictEqual(callCount, 3, `Expected 3 API calls, got ${callCount}`);
        assert.strictEqual(calledWithIds[0].length, 50, "First chunk must be 50");
        assert.strictEqual(calledWithIds[1].length, 50, "Second chunk must be 50");
        assert.strictEqual(calledWithIds[2].length, 20, "Third chunk must be 20");
        assert.strictEqual(result.details.size, 120, "Must return details for all 120 videos");
        assert.strictEqual(result.failures.length, 0, "Must have no failures");
    });
    it("issues exactly 1 call for 1 video ID", async () => {
        let callCount = 0;
        const stubFetcher = async (ids) => {
            callCount++;
            return ids.map(makeFakeDetails);
        };
        await batchFetchVideoDetails(["singleVideo"], stubFetcher);
        assert.strictEqual(callCount, 1, "Expected 1 API call for a single video");
    });
    it("issues exactly 1 call for exactly 50 video IDs", async () => {
        let callCount = 0;
        const stubFetcher = async (ids) => {
            callCount++;
            return ids.map(makeFakeDetails);
        };
        const videoIds = Array.from({ length: 50 }, (_, i) => `vid${i}`);
        await batchFetchVideoDetails(videoIds, stubFetcher);
        assert.strictEqual(callCount, 1, "Expected 1 API call for exactly 50 videos");
    });
    it("returns empty array for empty input", async () => {
        let callCount = 0;
        const stubFetcher = async (ids) => {
            callCount++;
            return ids.map(makeFakeDetails);
        };
        const result = await batchFetchVideoDetails([], stubFetcher);
        assert.strictEqual(callCount, 0, "Expected 0 API calls for empty input");
        assert.strictEqual(result.details.size, 0, "Expected empty details map");
        assert.strictEqual(result.failures.length, 0, "Expected no failures");
    });
    it("isolates per-chunk failures: 2 of 3 chunks succeed, 1 chunk throws", async () => {
        // 150 IDs → chunks: [0..49] (chunk 1), [50..99] (chunk 2), [100..149] (chunk 3)
        // chunk 2 (index 1) throws — chunks 1 and 3 must appear in details, chunk 2 IDs in failures
        const videoIds = Array.from({ length: 150 }, (_, i) => `vid${String(i).padStart(3, "0")}`);
        const chunk1Ids = videoIds.slice(0, 50);
        const chunk2Ids = videoIds.slice(50, 100);
        const chunk3Ids = videoIds.slice(100, 150);
        let callIndex = 0;
        const stubFetcher = async (ids) => {
            callIndex++;
            if (callIndex === 2) {
                throw new Error("Simulated chunk 2 network error");
            }
            return ids.map(makeFakeDetails);
        };
        const result = await batchFetchVideoDetails(videoIds, stubFetcher);
        // Returned details must contain all IDs from chunks 1 and 3 (100 IDs total)
        assert.strictEqual(result.details.size, 100, `Expected 100 IDs in details map, got ${result.details.size}`);
        for (const id of chunk1Ids) {
            assert.ok(result.details.has(id), `Chunk 1 ID ${id} must be present in details`);
        }
        for (const id of chunk3Ids) {
            assert.ok(result.details.has(id), `Chunk 3 ID ${id} must be present in details`);
        }
        // Failures array must have exactly one entry covering chunk 2's 50 IDs
        assert.strictEqual(result.failures.length, 1, `Expected 1 failure entry, got ${result.failures.length}`);
        assert.deepStrictEqual(result.failures[0].videoIds.sort(), chunk2Ids.slice().sort(), "Failure entry must list all 50 chunk 2 IDs");
        assert.ok(result.failures[0].reason.includes("Simulated chunk 2 network error"), "Failure reason must include the original error message");
    });
});
//# sourceMappingURL=videoBatchFetcher.test.js.map