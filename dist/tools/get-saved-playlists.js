import { z } from "zod";
import { getDb } from "../db/connection.js";
import { queryPlaylists, queryPlaylistItems, } from "../db/repos/playlists.js";
function formatPlaylist(p) {
    const created = p.published_at
        ? new Date(p.published_at).toLocaleDateString()
        : "N/A";
    const savedAt = new Date(p.saved_at).toLocaleDateString();
    const count = p.item_count != null ? `${p.item_count} videos` : "? videos";
    const desc = p.description
        ? `\n   ${p.description.slice(0, 160)}${p.description.length > 160 ? "..." : ""}`
        : "";
    return [
        `--- ${p.title ?? p.playlist_id} (${count}) ---`,
        `ID: ${p.playlist_id}`,
        `Created: ${created} | Saved: ${savedAt}${desc}`,
    ].join("\n");
}
function formatPlaylistItem(item) {
    const pos = item.position != null ? item.position + 1 : "?";
    const channel = item.channel_title ?? "Unknown";
    const pubDate = item.video_published_at
        ? new Date(item.video_published_at).toLocaleDateString()
        : "N/A";
    return [
        `${pos}. ${item.title ?? item.video_id ?? item.playlist_item_id}`,
        item.video_id ? `   URL: https://youtube.com/watch?v=${item.video_id}` : "",
        `   Channel: ${channel} | Published: ${pubDate}`,
        `   Item ID: ${item.playlist_item_id}`,
    ]
        .filter(Boolean)
        .join("\n");
}
export function registerGetSavedPlaylistsTool(server) {
    server.tool("get_saved_playlists", "Failsafe: query locally cached YouTube playlists and their items without an API call. The database is populated automatically when list_user_playlists and get_playlist_items fetch from the YouTube API — use this only as a fallback to avoid redundant API requests or when working offline.", {
        query: z
            .string()
            .optional()
            .describe("Text search in playlist title and description"),
        playlistId: z
            .string()
            .optional()
            .describe("If set, return the cached videos in this playlist instead of the playlist list"),
        limit: z
            .number()
            .min(1)
            .max(500)
            .default(50)
            .describe("Number of results (1-500, default 50)"),
        offset: z
            .number()
            .min(0)
            .default(0)
            .describe("Pagination offset (default 0)"),
    }, async ({ query, playlistId, limit, offset }) => {
        const db = getDb();
        if (playlistId) {
            let items;
            try {
                items = queryPlaylistItems(db, { playlistId, limit, offset });
            }
            catch (err) {
                process.stderr.write(`youtube-mcp: DB query failed (get_saved_playlists/items): ${err}\n`);
                return {
                    content: [
                        { type: "text", text: "Database query failed." },
                    ],
                };
            }
            if (items.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `No saved items found for playlist ${playlistId}.`,
                        },
                    ],
                };
            }
            const formatted = items.map(formatPlaylistItem).join("\n\n");
            return {
                content: [
                    {
                        type: "text",
                        text: `Playlist ${playlistId} — ${items.length} cached video(s):\n\n${formatted}`,
                    },
                ],
            };
        }
        let playlists;
        try {
            playlists = queryPlaylists(db, { query, limit, offset });
        }
        catch (err) {
            process.stderr.write(`youtube-mcp: DB query failed (get_saved_playlists): ${err}\n`);
            return {
                content: [
                    { type: "text", text: "Database query failed." },
                ],
            };
        }
        if (playlists.length === 0) {
            const msg = query
                ? `No saved playlists found matching "${query}".`
                : "No saved playlists found.";
            return { content: [{ type: "text", text: msg }] };
        }
        const formatted = playlists.map(formatPlaylist).join("\n\n");
        return {
            content: [
                {
                    type: "text",
                    text: `${playlists.length} saved playlist(s) (offset ${offset}):\n\n${formatted}`,
                },
            ],
        };
    });
}
//# sourceMappingURL=get-saved-playlists.js.map