/**
 * TDD test: batch videos.list call count for a 120-videoId playlist hydration.
 *
 * Acceptance criterion: hydrating 120 video IDs must invoke videos.list
 * exactly 3 times (chunks of 50, 50, 20).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { batchFetchVideoDetails } from "../services/videoBatchFetcher.js";
import type { VideoDetails } from "../types.js";

function makeFakeDetails(id: string): VideoDetails {
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
    const calledWithIds: string[][] = [];

    // Stub fetcher: records call arguments and returns fake VideoDetails
    const stubFetcher = async (ids: string[]): Promise<VideoDetails[]> => {
      callCount++;
      calledWithIds.push([...ids]);
      return ids.map(makeFakeDetails);
    };

    const videoIds = Array.from({ length: 120 }, (_, i) => `vid${String(i).padStart(3, "0")}`);
    const results = await batchFetchVideoDetails(videoIds, stubFetcher);

    assert.strictEqual(callCount, 3, `Expected 3 API calls, got ${callCount}`);
    assert.strictEqual(calledWithIds[0].length, 50, "First chunk must be 50");
    assert.strictEqual(calledWithIds[1].length, 50, "Second chunk must be 50");
    assert.strictEqual(calledWithIds[2].length, 20, "Third chunk must be 20");
    assert.strictEqual(results.length, 120, "Must return details for all 120 videos");
  });

  it("issues exactly 1 call for 1 video ID", async () => {
    let callCount = 0;
    const stubFetcher = async (ids: string[]): Promise<VideoDetails[]> => {
      callCount++;
      return ids.map(makeFakeDetails);
    };

    await batchFetchVideoDetails(["singleVideo"], stubFetcher);
    assert.strictEqual(callCount, 1, "Expected 1 API call for a single video");
  });

  it("issues exactly 1 call for exactly 50 video IDs", async () => {
    let callCount = 0;
    const stubFetcher = async (ids: string[]): Promise<VideoDetails[]> => {
      callCount++;
      return ids.map(makeFakeDetails);
    };

    const videoIds = Array.from({ length: 50 }, (_, i) => `vid${i}`);
    await batchFetchVideoDetails(videoIds, stubFetcher);
    assert.strictEqual(callCount, 1, "Expected 1 API call for exactly 50 videos");
  });

  it("returns empty array for empty input", async () => {
    let callCount = 0;
    const stubFetcher = async (ids: string[]): Promise<VideoDetails[]> => {
      callCount++;
      return ids.map(makeFakeDetails);
    };

    const results = await batchFetchVideoDetails([], stubFetcher);
    assert.strictEqual(callCount, 0, "Expected 0 API calls for empty input");
    assert.deepStrictEqual(results, []);
  });
});
