import type { DatabaseSync } from "node:sqlite";
import type { PlaylistRow, PlaylistItemRow } from "../types.js";
import { withTransaction } from "../connection.js";

export interface PlaylistInput {
  playlistId: string;
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  itemCount?: number | null;
}

export interface PlaylistItemInput {
  playlistItemId: string;
  playlistId: string;
  videoId?: string | null;
  position?: number | null;
  title?: string | null;
  channelTitle?: string | null;
  videoPublishedAt?: string | null;
}

export interface QueryPlaylistsOpts {
  query?: string;
  limit?: number;
  offset?: number;
}

export interface QueryPlaylistItemsOpts {
  playlistId?: string;
  videoId?: string;
  limit?: number;
  offset?: number;
}

export function upsertPlaylist(db: DatabaseSync, pl: PlaylistInput): void {
  db.prepare(
    `
    INSERT OR REPLACE INTO playlists (
      playlist_id, title, description, published_at, item_count, saved_at
    ) VALUES (
      @playlist_id, @title, @description, @published_at, @item_count, @saved_at
    )
  `
  ).run({
    playlist_id: pl.playlistId,
    title: pl.title ?? null,
    description: pl.description ?? null,
    published_at: pl.publishedAt ?? null,
    item_count: pl.itemCount ?? null,
    saved_at: new Date().toISOString(),
  });
}

export function upsertPlaylists(db: DatabaseSync, playlists: PlaylistInput[]): void {
  withTransaction(db, () => {
    for (const p of playlists) upsertPlaylist(db, p);
  });
}

export function upsertPlaylistItem(
  db: DatabaseSync,
  item: PlaylistItemInput
): void {
  db.prepare(
    `
    INSERT OR REPLACE INTO playlist_items (
      playlist_item_id, playlist_id, video_id, position, title,
      channel_title, video_published_at, saved_at
    ) VALUES (
      @playlist_item_id, @playlist_id, @video_id, @position, @title,
      @channel_title, @video_published_at, @saved_at
    )
  `
  ).run({
    playlist_item_id: item.playlistItemId,
    playlist_id: item.playlistId,
    video_id: item.videoId ?? null,
    position: item.position ?? null,
    title: item.title ?? null,
    channel_title: item.channelTitle ?? null,
    video_published_at: item.videoPublishedAt ?? null,
    saved_at: new Date().toISOString(),
  });
}

export function upsertPlaylistItems(
  db: DatabaseSync,
  items: PlaylistItemInput[]
): void {
  withTransaction(db, () => {
    for (const it of items) upsertPlaylistItem(db, it);
  });
}

export function queryPlaylists(
  db: DatabaseSync,
  opts: QueryPlaylistsOpts = {}
): PlaylistRow[] {
  const { query, limit = 50, offset = 0 } = opts;
  if (query) {
    const like = `%${query}%`;
    return db
      .prepare(
        `
      SELECT * FROM playlists
      WHERE title LIKE ? OR description LIKE ?
      ORDER BY saved_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(like, like, limit, offset) as unknown as PlaylistRow[];
  }
  return db
    .prepare(
      `
    SELECT * FROM playlists
    ORDER BY saved_at DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(limit, offset) as unknown as PlaylistRow[];
}

export function queryPlaylistItems(
  db: DatabaseSync,
  opts: QueryPlaylistItemsOpts = {}
): PlaylistItemRow[] {
  const { playlistId, videoId, limit = 500, offset = 0 } = opts;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (playlistId) {
    conditions.push("playlist_id = ?");
    params.push(playlistId);
  }
  if (videoId) {
    conditions.push("video_id = ?");
    params.push(videoId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit, offset);

  return db
    .prepare(
      `
    SELECT * FROM playlist_items
    ${where}
    ORDER BY playlist_id, position ASC
    LIMIT ? OFFSET ?
  `
    )
    .all(...(params as never[])) as unknown as PlaylistItemRow[];
}
