import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchOAuthApi } from "../services/youtube-oauth.js";
import { getDb } from "../db/connection.js";
import { upsertPlaylistItems } from "../db/repos/playlists.js";
import {
  getVideoHydrationStates,
  upsertVideo,
  type VideoHydrationState,
} from "../db/repos/videos.js";
import { batchFetchVideoDetails } from "../services/videoBatchFetcher.js";
import { fetchAndStoreVideo, type FetchVideoOutcome } from "./get-video-details.js";

/**
 * Per-video reason a candidate either needs hydration or can be skipped.
 *
 * @see ../../docs/transcript-retry-semantics.md for the persisted-status
 * retry table that drives "transcript-retryable" vs "missing-no-captions".
 *
 * @internal — exported for unit testing only.
 */
export type HydrationReason =
  | "no-video-row"
  | "metadata-incomplete"
  | "transcript-retryable"
  | "complete"
  | "missing-no-captions";

/**
 * @internal — exported for unit testing only.
 */
export interface HydrationDecision {
  needsHydrate: boolean;
  reason: HydrationReason;
}

/**
 * Pure decision function: given a persisted hydration state, returns whether
 * this video should be (re)fetched.
 *
 * Predicate (see docs/transcript-retry-semantics.md):
 *   - No `videos` row                                                  → fetch
 *   - `metadata_status != 'ok'`                                        → fetch
 *   - Metadata ok and (transcripts row OR transcript_status='ok')      → skip
 *   - Metadata ok, no transcript, transcript_status='missing'          → skip (terminal)
 *   - Otherwise (transcript_status null/pending/failed)                → fetch (retryable)
 *
 * @internal — exported for unit testing only.
 */
export function decideHydration(state: VideoHydrationState): HydrationDecision {
  if (!state.hasVideoRow) return { needsHydrate: true, reason: "no-video-row" };
  if (state.metadataStatus !== "ok") {
    return { needsHydrate: true, reason: "metadata-incomplete" };
  }
  if (state.hasTranscriptRow || state.transcriptStatus === "ok") {
    return { needsHydrate: false, reason: "complete" };
  }
  if (state.transcriptStatus === "missing") {
    return { needsHydrate: false, reason: "missing-no-captions" };
  }
  return { needsHydrate: true, reason: "transcript-retryable" };
}

/**
 * Machine-friendly summary of a get_new_playlist_items response.
 *
 * Field semantics:
 *   - total: live playlist size (after pagination, capped at maxResults)
 *   - alreadyComplete: count where decideHydration → needsHydrate=false
 *   - candidates: count where decideHydration → needsHydrate=true
 *   - hydrated: number of candidates the tool actually attempted to ingest
 *               (equals candidates when hydrate=true and 0 when hydrate=false)
 *   - hydrationOk / hydrationMissing / hydrationFailed: per-outcome counts
 *     across the hydrated set
 *
 * @internal — exported for unit testing only.
 */
export interface NewPlaylistItemsSummary {
  total: number;
  alreadyComplete: number;
  candidates: number;
  hydrated: number;
  hydrationOk: number;
  hydrationMissing: number;
  hydrationFailed: number;
}

/**
 * @internal — exported for unit testing only.
 */
export interface CandidateHydrationOutcome {
  videoId: string;
  metadata: "ok" | "failed";
  transcript: FetchVideoOutcome["transcript"];
  reason?: string;
}

/**
 * @internal — exported for unit testing only.
 */
export function buildNewPlaylistItemsSummary(
  total: number,
  alreadyComplete: number,
  candidates: number,
  outcomes: CandidateHydrationOutcome[]
): NewPlaylistItemsSummary {
  return {
    total,
    alreadyComplete,
    candidates,
    hydrated: outcomes.length,
    hydrationOk: outcomes.filter((o) => o.transcript === "ok").length,
    hydrationMissing: outcomes.filter((o) => o.transcript === "missing").length,
    hydrationFailed: outcomes.filter(
      (o) => o.metadata === "failed" || o.transcript === "failed"
    ).length,
  };
}

interface PlaylistItemSnippet {
  title: string;
  description: string;
  publishedAt: string;
  position: number;
  videoOwnerChannelTitle?: string;
  videoOwnerChannelId?: string;
  resourceId: { kind: string; videoId: string };
}

interface PlaylistItemRaw {
  id: string;
  snippet: PlaylistItemSnippet;
  contentDetails: {
    videoId: string;
    videoPublishedAt?: string;
  };
}

export function registerGetNewPlaylistItemsTool(server: McpServer): void {
  server.tool(
    "get_new_playlist_items",
    "Diff a YouTube playlist against the local SQLite cache and (by default) hydrate only the new/retryable items. Fetches the live playlist via playlistItems.list, refreshes the playlist_items link table, then computes which video_ids still need ingestion (no videos row, metadata not ok, or transcript retryable per docs/transcript-retry-semantics.md). With hydrate=true (default), runs the same metadata+transcript path as get_playlist_items but ONLY for the diff set, saving quota when most of the playlist is already cached. With hydrate=false, returns the diff list without any videos.list calls. Requires OAuth credentials (YOUTUBE_OAUTH_TOKEN_PATH).",
    {
      playlistId: z
        .string()
        .describe("YouTube playlist ID (e.g. PLbclGrMrkq04ygNoBJC4Y1LPfBo8qzFhA)"),
      maxResults: z
        .number()
        .min(1)
        .max(500)
        .default(500)
        .describe("Maximum total videos to fetch from the playlist (default 500, paginates automatically)"),
      hydrate: z
        .boolean()
        .default(true)
        .describe(
          "When true (default), fetch metadata + transcript for every video that the diff identifies as needing ingestion. When false, only return the diff list — no videos.list calls are issued."
        ),
    },
    async ({ playlistId, maxResults, hydrate }) => {
      const items: PlaylistItemRaw[] = [];
      let pageToken: string | undefined;

      do {
        const params: Record<string, string> = {
          part: "snippet,contentDetails",
          playlistId,
          maxResults: String(Math.min(50, maxResults - items.length)),
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await fetchOAuthApi("playlistItems", params);
        const batch = (data.items as PlaylistItemRaw[]) ?? [];
        items.push(...batch);

        const next = data.nextPageToken as string | undefined;
        pageToken = items.length < maxResults ? next : undefined;
      } while (pageToken);

      if (items.length === 0) {
        const empty: NewPlaylistItemsSummary = {
          total: 0,
          alreadyComplete: 0,
          candidates: 0,
          hydrated: 0,
          hydrationOk: 0,
          hydrationMissing: 0,
          hydrationFailed: 0,
        };
        return {
          content: [
            { type: "text", text: `No videos found in playlist ${playlistId}.` },
          ],
          structuredContent: { summary: empty },
          summary: empty,
        };
      }

      const db = getDb();

      // Step 1: refresh the playlist_items link table so the local mapping
      // reflects the current live playlist (positions, titles, etc.).
      try {
        upsertPlaylistItems(
          db,
          items.map((item) => ({
            playlistItemId: item.id,
            playlistId,
            videoId: item.contentDetails.videoId,
            position: item.snippet.position,
            title: item.snippet.title,
            channelTitle: item.snippet.videoOwnerChannelTitle ?? null,
            videoPublishedAt: item.contentDetails.videoPublishedAt ?? null,
          }))
        );
      } catch (err) {
        process.stderr.write(
          `youtube-mcp: DB upsert failed (get_new_playlist_items): ${err}\n`
        );
      }

      // Step 2: diff against the local cache. Deduplicate playlist video_ids
      // first — a video can appear at multiple positions in a playlist, but
      // for hydration purposes it only needs to be fetched once.
      const uniqueVideoIds = Array.from(
        new Set(items.map((item) => item.contentDetails.videoId))
      );
      const states = getVideoHydrationStates(db, uniqueVideoIds);

      const candidates: { videoId: string; reason: HydrationReason }[] = [];
      const skipped: { videoId: string; reason: HydrationReason }[] = [];
      for (const id of uniqueVideoIds) {
        const decision = decideHydration(states.get(id)!);
        if (decision.needsHydrate) {
          candidates.push({ videoId: id, reason: decision.reason });
        } else {
          skipped.push({ videoId: id, reason: decision.reason });
        }
      }

      // Step 3: optionally hydrate only the candidates. Mirrors
      // get_playlist_items' batch-then-serial-transcript flow, but the batch
      // contains only `candidates.length` ids — saving quota when most of the
      // playlist is already cached.
      const outcomes: CandidateHydrationOutcome[] = [];
      if (hydrate && candidates.length > 0) {
        const candidateIds = candidates.map((c) => c.videoId);
        const detailsMap = new Map<string, FetchVideoOutcome["details"]>();
        const metadataFailures = new Set<string>();
        const { details: fetchedDetails, failures: chunkFailures } =
          await batchFetchVideoDetails(candidateIds);

        for (const details of fetchedDetails.values()) {
          detailsMap.set(details.videoId, details);
          try {
            upsertVideo(db, details, "get_new_playlist_items", {
              metadataStatus: "ok",
            });
          } catch (err) {
            process.stderr.write(
              `youtube-mcp: DB upsert failed for ${details.videoId}: ${err}\n`
            );
          }
        }

        for (const failure of chunkFailures) {
          process.stderr.write(
            `youtube-mcp: batch chunk failed (${failure.videoIds.length} IDs): ${failure.reason}\n`
          );
          for (const id of failure.videoIds) {
            metadataFailures.add(id);
            try {
              upsertVideo(
                db,
                { videoId: id },
                "get_new_playlist_items",
                {
                  metadataStatus: "failed",
                  transcriptStatus: "failed",
                  transcriptReason: failure.reason,
                }
              );
            } catch (err) {
              process.stderr.write(
                `youtube-mcp: DB upsert failed (failed-chunk stub) for ${id}: ${err}\n`
              );
            }
          }
        }

        // IDs requested but not returned by the API (deleted/private videos).
        for (const id of candidateIds) {
          if (!detailsMap.has(id) && !metadataFailures.has(id)) {
            metadataFailures.add(id);
            try {
              upsertVideo(
                db,
                { videoId: id },
                "get_new_playlist_items",
                { metadataStatus: "failed" }
              );
            } catch (err) {
              process.stderr.write(
                `youtube-mcp: DB upsert failed (missing-video stub) for ${id}: ${err}\n`
              );
            }
          }
        }

        // Per-video transcript fetch — serial via fetchAndStoreVideo with
        // preFetchedDetails, preserving the 2*ceil(M/50) quota formula
        // (1 playlistItems.list per page already consumed in Step 1, plus
        // ceil(M/50) videos.list calls only over the diff set M).
        for (const id of candidateIds) {
          if (metadataFailures.has(id)) {
            outcomes.push({
              videoId: id,
              metadata: "failed",
              transcript: "skipped",
              reason: "metadata fetch failed",
            });
            continue;
          }

          const preFetchedDetails = detailsMap.get(id);
          if (!preFetchedDetails) {
            outcomes.push({
              videoId: id,
              metadata: "failed",
              transcript: "skipped",
              reason: "metadata missing from batch map",
            });
            continue;
          }

          const outcome = await fetchAndStoreVideo(id, true, {
            preFetchedDetails,
            source: "get_new_playlist_items",
          });

          outcomes.push({
            videoId: outcome.videoId,
            metadata: outcome.metadata,
            transcript: outcome.transcript,
            reason: outcome.transcriptReason,
          });
        }
      }

      const summary = buildNewPlaylistItemsSummary(
        uniqueVideoIds.length,
        skipped.length,
        candidates.length,
        outcomes
      );

      const candidateLines = candidates.map((c) => {
        const item = items.find(
          (it) => it.contentDetails.videoId === c.videoId
        );
        const title = item?.snippet.title ?? "(unknown title)";
        return `- ${c.videoId} [${c.reason}]: ${title}`;
      });

      const outcomeLines = outcomes.map((o) => {
        const transcriptPart = o.reason
          ? `transcript=${o.transcript} (${o.reason})`
          : `transcript=${o.transcript}`;
        return `- ${o.videoId}: metadata=${o.metadata} ${transcriptPart}`;
      });

      const parts = [
        `Playlist ${playlistId} — diff vs local cache:`,
        `  total in playlist:    ${summary.total}`,
        `  already complete:     ${summary.alreadyComplete}`,
        `  needs hydration:      ${summary.candidates}`,
      ];

      if (candidateLines.length > 0) {
        parts.push(``, `Candidates (${candidates.length}):`, ...candidateLines);
      }

      if (hydrate && outcomes.length > 0) {
        parts.push(
          ``,
          `Hydration statuses (${outcomes.length} attempted):`,
          ...outcomeLines,
          ``,
          `Hydration summary: ok=${summary.hydrationOk} missing=${summary.hydrationMissing} failed=${summary.hydrationFailed}`
        );
      } else if (!hydrate) {
        parts.push(
          ``,
          `hydrate=false — no videos.list calls were issued. Pass hydrate=true (default) to ingest the candidates.`
        );
      } else if (candidates.length === 0) {
        parts.push(``, `Nothing to hydrate — the local cache is already complete for this playlist.`);
      }

      return {
        content: [{ type: "text", text: parts.join("\n") }],
        structuredContent: { summary },
        summary,
      };
    }
  );
}
