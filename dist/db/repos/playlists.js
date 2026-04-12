import { withTransaction } from "../connection.js";
export function upsertPlaylist(db, pl) {
    db.prepare(`
    INSERT OR REPLACE INTO playlists (
      playlist_id, title, description, published_at, item_count, saved_at
    ) VALUES (
      @playlist_id, @title, @description, @published_at, @item_count, @saved_at
    )
  `).run({
        playlist_id: pl.playlistId,
        title: pl.title ?? null,
        description: pl.description ?? null,
        published_at: pl.publishedAt ?? null,
        item_count: pl.itemCount ?? null,
        saved_at: new Date().toISOString(),
    });
}
export function upsertPlaylists(db, playlists) {
    withTransaction(db, () => {
        for (const p of playlists)
            upsertPlaylist(db, p);
    });
}
export function upsertPlaylistItem(db, item) {
    db.prepare(`
    INSERT OR REPLACE INTO playlist_items (
      playlist_item_id, playlist_id, video_id, position, title,
      channel_title, video_published_at, saved_at
    ) VALUES (
      @playlist_item_id, @playlist_id, @video_id, @position, @title,
      @channel_title, @video_published_at, @saved_at
    )
  `).run({
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
export function upsertPlaylistItems(db, items) {
    withTransaction(db, () => {
        for (const it of items)
            upsertPlaylistItem(db, it);
    });
}
export function queryPlaylists(db, opts = {}) {
    const { query, limit = 50, offset = 0 } = opts;
    if (query) {
        const like = `%${query}%`;
        return db
            .prepare(`
      SELECT * FROM playlists
      WHERE title LIKE ? OR description LIKE ?
      ORDER BY saved_at DESC
      LIMIT ? OFFSET ?
    `)
            .all(like, like, limit, offset);
    }
    return db
        .prepare(`
    SELECT * FROM playlists
    ORDER BY saved_at DESC
    LIMIT ? OFFSET ?
  `)
        .all(limit, offset);
}
export function queryPlaylistItems(db, opts = {}) {
    const { playlistId, videoId, limit = 500, offset = 0 } = opts;
    const conditions = [];
    const params = [];
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
        .prepare(`
    SELECT * FROM playlist_items
    ${where}
    ORDER BY playlist_id, position ASC
    LIMIT ? OFFSET ?
  `)
        .all(...params);
}
//# sourceMappingURL=playlists.js.map