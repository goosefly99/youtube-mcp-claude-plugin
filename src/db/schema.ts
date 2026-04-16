import type { DatabaseSync } from "node:sqlite";

/**
 * Creates all database tables if they don't already exist.
 * Safe to call on every startup — all statements use IF NOT EXISTS.
 * Additive column migrations use PRAGMA table_info to stay idempotent.
 */
export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER NOT NULL,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS videos (
      video_id         TEXT PRIMARY KEY,
      title            TEXT,
      channel_id       TEXT,
      channel_title    TEXT,
      description      TEXT,
      published_at     TEXT,
      duration         TEXT,
      category_id      TEXT,
      default_language TEXT,
      thumbnail_url    TEXT,
      view_count       INTEGER,
      like_count       INTEGER,
      comment_count    INTEGER,
      tags_json        TEXT,
      source           TEXT,
      saved_at         TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_videos_channel_id ON videos(channel_id);
    CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos(published_at);
    CREATE INDEX IF NOT EXISTS idx_videos_saved_at ON videos(saved_at);

    CREATE TABLE IF NOT EXISTS transcripts (
      video_id          TEXT NOT NULL,
      language          TEXT NOT NULL,
      is_auto_generated INTEGER NOT NULL,
      full_text         TEXT,
      segments_json     TEXT,
      saved_at          TEXT NOT NULL,
      PRIMARY KEY (video_id, language)
    );

    CREATE INDEX IF NOT EXISTS idx_transcripts_saved_at ON transcripts(saved_at);

    CREATE TABLE IF NOT EXISTS playlists (
      playlist_id  TEXT PRIMARY KEY,
      title        TEXT,
      description  TEXT,
      published_at TEXT,
      item_count   INTEGER,
      saved_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_items (
      playlist_item_id   TEXT PRIMARY KEY,
      playlist_id        TEXT NOT NULL,
      video_id           TEXT,
      position           INTEGER,
      title              TEXT,
      channel_title      TEXT,
      video_published_at TEXT,
      saved_at           TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_id ON playlist_items(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_items_video_id    ON playlist_items(video_id);
  `);

  // Additive migration: add status columns to videos table if not present.
  // Uses PRAGMA table_info for idempotency — safe to run multiple times.
  const videoCols = (
    db.prepare("PRAGMA table_info(videos)").all() as Array<{ name: string }>
  ).map((c) => c.name);

  if (!videoCols.includes("metadata_status")) {
    db.exec("ALTER TABLE videos ADD COLUMN metadata_status TEXT NULL");
  }
  if (!videoCols.includes("transcript_status")) {
    db.exec("ALTER TABLE videos ADD COLUMN transcript_status TEXT NULL");
  }
  if (!videoCols.includes("transcript_reason")) {
    db.exec("ALTER TABLE videos ADD COLUMN transcript_reason TEXT NULL");
  }

  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM schema_version")
    .get() as { cnt: number } | undefined;
  if (!row || row.cnt === 0) {
    db.prepare(
      "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)"
    ).run(1, new Date().toISOString());
  }
}
