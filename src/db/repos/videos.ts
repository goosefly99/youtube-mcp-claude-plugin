import type { DatabaseSync } from "node:sqlite";
import type { VideoSearchResult, VideoDetails } from "../../types.js";
import type { VideoRow } from "../types.js";
import type { MetadataStatus, TranscriptDbStatus } from "../../types/status.js";
import { withTransaction } from "../connection.js";

export interface VideoStatusOpts {
  metadataStatus?: MetadataStatus | null;
  transcriptStatus?: TranscriptDbStatus | null;
  transcriptReason?: string | null;
}

export interface QueryVideosOpts {
  query?: string;
  channel?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

/**
 * Snapshot of a video's persisted state from the perspective of "do we need
 * to (re)fetch this video?". Used by the diff path of get_new_playlist_items.
 *
 * `hasVideoRow=false` means the video has never been ingested.
 * `hasTranscriptRow=true` means a `transcripts` row exists for any language.
 */
export interface VideoHydrationState {
  videoId: string;
  hasVideoRow: boolean;
  metadataStatus: string | null;
  hasTranscriptRow: boolean;
  transcriptStatus: string | null;
}

/**
 * Returns the persisted hydration state for each requested videoId. Always
 * includes one entry per input id — IDs that have no `videos` row appear with
 * `hasVideoRow=false` so callers can drive a single diff loop.
 *
 * Issues a single SQL query parameterized with one placeholder per id; safe
 * for the playlist-page volumes this codebase deals with (≤ 500 ids).
 */
export function getVideoHydrationStates(
  db: DatabaseSync,
  videoIds: string[]
): Map<string, VideoHydrationState> {
  const result = new Map<string, VideoHydrationState>();
  for (const id of videoIds) {
    result.set(id, {
      videoId: id,
      hasVideoRow: false,
      metadataStatus: null,
      hasTranscriptRow: false,
      transcriptStatus: null,
    });
  }
  if (videoIds.length === 0) return result;

  const placeholders = videoIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
    SELECT
      v.video_id          AS video_id,
      v.metadata_status   AS metadata_status,
      v.transcript_status AS transcript_status,
      EXISTS (SELECT 1 FROM transcripts t WHERE t.video_id = v.video_id) AS has_transcript
    FROM videos v
    WHERE v.video_id IN (${placeholders})
  `
    )
    .all(...(videoIds as never[])) as Array<{
    video_id: string;
    metadata_status: string | null;
    transcript_status: string | null;
    has_transcript: number;
  }>;

  for (const row of rows) {
    result.set(row.video_id, {
      videoId: row.video_id,
      hasVideoRow: true,
      metadataStatus: row.metadata_status,
      hasTranscriptRow: row.has_transcript === 1,
      transcriptStatus: row.transcript_status,
    });
  }
  return result;
}

function toIntOrNull(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Upserts a single video row. Accepts either a partial search result or full
 * video details — fields that are unavailable on the search result are stored
 * as NULL and filled in later if get_video_details is called for the same id.
 *
 * The optional `status` parameter writes the three ingest-status columns
 * (metadata_status, transcript_status, transcript_reason). When omitted,
 * existing status values are preserved via COALESCE.
 */
export function upsertVideo(
  db: DatabaseSync,
  video: Partial<VideoDetails> & { videoId: string },
  source: string,
  status?: VideoStatusOpts
): void {
  db.prepare(
    `
    INSERT INTO videos (
      video_id, title, channel_id, channel_title, description,
      published_at, duration, category_id, default_language, thumbnail_url,
      view_count, like_count, comment_count, tags_json, source, saved_at,
      metadata_status, transcript_status, transcript_reason
    ) VALUES (
      @video_id, @title, @channel_id, @channel_title, @description,
      @published_at, @duration, @category_id, @default_language, @thumbnail_url,
      @view_count, @like_count, @comment_count, @tags_json, @source, @saved_at,
      @metadata_status, @transcript_status, @transcript_reason
    )
    ON CONFLICT(video_id) DO UPDATE SET
      title             = COALESCE(excluded.title, videos.title),
      channel_id        = COALESCE(excluded.channel_id, videos.channel_id),
      channel_title     = COALESCE(excluded.channel_title, videos.channel_title),
      description       = COALESCE(excluded.description, videos.description),
      published_at      = COALESCE(excluded.published_at, videos.published_at),
      duration          = COALESCE(excluded.duration, videos.duration),
      category_id       = COALESCE(excluded.category_id, videos.category_id),
      default_language  = COALESCE(excluded.default_language, videos.default_language),
      thumbnail_url     = COALESCE(excluded.thumbnail_url, videos.thumbnail_url),
      view_count        = COALESCE(excluded.view_count, videos.view_count),
      like_count        = COALESCE(excluded.like_count, videos.like_count),
      comment_count     = COALESCE(excluded.comment_count, videos.comment_count),
      tags_json         = COALESCE(excluded.tags_json, videos.tags_json),
      source            = excluded.source,
      saved_at          = excluded.saved_at,
      metadata_status   = COALESCE(excluded.metadata_status, videos.metadata_status),
      transcript_status = COALESCE(excluded.transcript_status, videos.transcript_status),
      transcript_reason = COALESCE(excluded.transcript_reason, videos.transcript_reason)
  `
  ).run({
    video_id: video.videoId,
    title: video.title ?? null,
    channel_id: video.channelId ?? null,
    channel_title: video.channelTitle ?? null,
    description: video.description ?? null,
    published_at: video.publishedAt ?? null,
    duration: video.duration ?? null,
    category_id: video.categoryId ?? null,
    default_language: video.defaultLanguage ?? null,
    thumbnail_url: video.thumbnailUrl ?? null,
    view_count: toIntOrNull(video.statistics?.viewCount),
    like_count: toIntOrNull(video.statistics?.likeCount),
    comment_count: toIntOrNull(video.statistics?.commentCount),
    tags_json: video.tags && video.tags.length > 0 ? JSON.stringify(video.tags) : null,
    source,
    saved_at: new Date().toISOString(),
    metadata_status: status?.metadataStatus ?? null,
    transcript_status: status?.transcriptStatus ?? null,
    transcript_reason: status?.transcriptReason ?? null,
  });
}

/**
 * Upserts a video row from a VideoSearchResult (partial data, no duration/tags).
 */
export function upsertSearchResult(
  db: DatabaseSync,
  result: VideoSearchResult,
  source: string
): void {
  db.prepare(
    `
    INSERT INTO videos (
      video_id, title, channel_title, description, published_at, thumbnail_url,
      view_count, like_count, source, saved_at
    ) VALUES (
      @video_id, @title, @channel_title, @description, @published_at, @thumbnail_url,
      @view_count, @like_count, @source, @saved_at
    )
    ON CONFLICT(video_id) DO UPDATE SET
      title         = COALESCE(excluded.title, videos.title),
      channel_title = COALESCE(excluded.channel_title, videos.channel_title),
      description   = COALESCE(excluded.description, videos.description),
      published_at  = COALESCE(excluded.published_at, videos.published_at),
      thumbnail_url = COALESCE(excluded.thumbnail_url, videos.thumbnail_url),
      view_count    = COALESCE(excluded.view_count, videos.view_count),
      like_count    = COALESCE(excluded.like_count, videos.like_count),
      source        = excluded.source,
      saved_at      = excluded.saved_at
  `
  ).run({
    video_id: result.videoId,
    title: result.title ?? null,
    channel_title: result.channelTitle ?? null,
    description: result.description ?? null,
    published_at: result.publishedAt ?? null,
    thumbnail_url: result.thumbnailUrl ?? null,
    view_count: toIntOrNull(result.viewCount),
    like_count: toIntOrNull(result.likeCount),
    source,
    saved_at: new Date().toISOString(),
  });
}

export function upsertSearchResults(
  db: DatabaseSync,
  results: VideoSearchResult[],
  source: string
): void {
  withTransaction(db, () => {
    for (const r of results) upsertSearchResult(db, r, source);
  });
}

/**
 * Query saved videos with optional filters. All filters use LIKE for partial
 * matches. Results are ordered by saved_at descending.
 */
export function queryVideos(
  db: DatabaseSync,
  opts: QueryVideosOpts = {}
): VideoRow[] {
  const { query, channel, source, limit = 20, offset = 0 } = opts;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query) {
    conditions.push("(title LIKE ? OR description LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }
  if (channel) {
    conditions.push("channel_title LIKE ?");
    params.push(`%${channel}%`);
  }
  if (source) {
    conditions.push("source = ?");
    params.push(source);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit, offset);

  return db
    .prepare(
      `
    SELECT * FROM videos
    ${where}
    ORDER BY saved_at DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(...(params as never[])) as unknown as VideoRow[];
}
