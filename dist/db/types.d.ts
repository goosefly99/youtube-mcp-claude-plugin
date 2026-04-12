/**
 * TypeScript row interfaces matching the SQLite DDL in schema.ts.
 * These represent the shape of rows as returned by better-sqlite3 queries.
 */
export interface VideoRow {
    video_id: string;
    title: string | null;
    channel_id: string | null;
    channel_title: string | null;
    description: string | null;
    published_at: string | null;
    duration: string | null;
    category_id: string | null;
    default_language: string | null;
    thumbnail_url: string | null;
    view_count: number | null;
    like_count: number | null;
    comment_count: number | null;
    tags_json: string | null;
    source: string | null;
    saved_at: string;
}
export interface TranscriptRow {
    video_id: string;
    language: string;
    is_auto_generated: number;
    full_text: string | null;
    segments_json: string | null;
    saved_at: string;
}
export interface PlaylistRow {
    playlist_id: string;
    title: string | null;
    description: string | null;
    published_at: string | null;
    item_count: number | null;
    saved_at: string;
}
export interface PlaylistItemRow {
    playlist_item_id: string;
    playlist_id: string;
    video_id: string | null;
    position: number | null;
    title: string | null;
    channel_title: string | null;
    video_published_at: string | null;
    saved_at: string;
}
