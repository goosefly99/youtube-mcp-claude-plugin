/**
 * Batch fetcher for YouTube videos.list API.
 *
 * The YouTube Data API v3 `videos.list` endpoint accepts up to 50 video IDs
 * per request. This module chunks an arbitrary list of IDs into groups of 50
 * and issues one API call per chunk, collecting the results.
 *
 * Quota note: each `videos.list` call costs 1 quota unit regardless of how
 * many IDs are in the `id` parameter (up to 50). Batching 50 IDs per call
 * is therefore always quota-optimal. For a playlist of N videos, the number
 * of `videos.list` calls is ceil(N / 50).
 */

import { config } from "../config.js";
import type { VideoDetails } from "../types.js";

export const BATCH_SIZE = 50;

/** Signature for the function that performs one `videos.list` network call. */
export type VideoListFetcher = (ids: string[]) => Promise<VideoDetails[]>;

/**
 * Default implementation: calls the YouTube Data API v3 `videos.list` endpoint
 * with part=snippet,contentDetails,statistics for the given IDs.
 */
export async function fetchVideoBatch(ids: string[]): Promise<VideoDetails[]> {
  if (ids.length === 0) return [];

  const url = new URL(`${config.youtubeApiBaseUrl}/videos`);
  url.searchParams.set("key", config.youtubeApiKey);
  url.searchParams.set("part", "snippet,contentDetails,statistics");
  url.searchParams.set("id", ids.join(","));

  const response = await fetch(url.toString());
  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const error = (data as Record<string, Record<string, unknown>>).error;
    const message = error?.message ?? `YouTube API error: ${response.status}`;
    throw new Error(String(message));
  }

  interface VideoItem {
    id: string;
    snippet: {
      title: string;
      channelTitle: string;
      description: string;
      publishedAt: string;
      thumbnails: { medium?: { url: string } };
      tags?: string[];
      categoryId: string;
      defaultLanguage?: string;
    };
    contentDetails: { duration: string };
    statistics: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
  }

  const items = (data.items as VideoItem[]) ?? [];
  return items.map((item) => ({
    videoId: item.id,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? "",
    duration: parseDuration(item.contentDetails.duration),
    tags: item.snippet.tags ?? [],
    categoryId: item.snippet.categoryId,
    defaultLanguage: item.snippet.defaultLanguage,
    statistics: {
      viewCount: item.statistics.viewCount ?? "0",
      likeCount: item.statistics.likeCount ?? "0",
      commentCount: item.statistics.commentCount ?? "0",
    },
  }));
}

/**
 * Fetch VideoDetails for a list of video IDs, issuing one `videos.list` call
 * per chunk of up to BATCH_SIZE (50) IDs.
 *
 * @param videoIds  List of bare YouTube video IDs.
 * @param fetcher   Optional override for the batch API call (used in tests).
 * @returns         Flat array of VideoDetails in the same order as input IDs.
 *                  Videos not returned by the API (e.g. deleted) are silently
 *                  absent from the result.
 */
export async function batchFetchVideoDetails(
  videoIds: string[],
  fetcher: VideoListFetcher = fetchVideoBatch
): Promise<VideoDetails[]> {
  if (videoIds.length === 0) return [];

  const results: VideoDetails[] = [];

  for (let offset = 0; offset < videoIds.length; offset += BATCH_SIZE) {
    const chunk = videoIds.slice(offset, offset + BATCH_SIZE);
    const batchResults = await fetcher(chunk);
    results.push(...batchResults);
  }

  return results;
}

function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso;
  const h = match[1] ? `${match[1]}h ` : "";
  const m = match[2] ? `${match[2]}m ` : "";
  const s = match[3] ? `${match[3]}s` : "";
  return (h + m + s).trim() || "0s";
}
