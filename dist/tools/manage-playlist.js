import { z } from "zod";
import { fetchOAuthApi, mutateOAuthApi } from "../services/youtube-oauth.js";
import { parseVideoId } from "../services/youtube-api.js";
export function registerManagePlaylistTools(server) {
    // ── add_to_playlist ────────────────────────────────────────────────────────
    server.tool("add_to_playlist", "Add a video to a YouTube playlist. Accepts a video ID or full YouTube URL. Optionally specify a 0-based position. Requires OAuth credentials (YOUTUBE_OAUTH_TOKEN_PATH).", {
        playlistId: z
            .string()
            .describe("Target playlist ID (e.g. PLbclGrMrkq04ygNoBJC4Y1LPfBo8qzFhA)"),
        videoId: z
            .string()
            .describe("Video to add — bare ID (e.g. dQw4w9WgXcQ) or full YouTube URL"),
        position: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("0-based position to insert the video (omit to append at end)"),
    }, async ({ playlistId, videoId, position }) => {
        const vid = parseVideoId(videoId);
        const snippet = {
            playlistId,
            resourceId: { kind: "youtube#video", videoId: vid },
        };
        if (position !== undefined) {
            snippet.position = position;
        }
        const result = await mutateOAuthApi("POST", "playlistItems", { part: "snippet" }, { snippet });
        const itemId = result?.id ?? "unknown";
        const posMsg = position !== undefined ? ` at position ${position}` : " at end";
        return {
            content: [
                {
                    type: "text",
                    text: `Added video ${vid} to playlist ${playlistId}${posMsg}.\nPlaylist item ID: ${itemId}`,
                },
            ],
        };
    });
    // ── remove_from_playlist ───────────────────────────────────────────────────
    server.tool("remove_from_playlist", "Remove a video from a YouTube playlist by its playlist item ID (not the video ID). Use get_playlist_items to obtain item IDs. Requires OAuth credentials (YOUTUBE_OAUTH_TOKEN_PATH).", {
        playlistItemId: z
            .string()
            .describe("Playlist item ID to remove (the 'Item ID' field from get_playlist_items)"),
    }, async ({ playlistItemId }) => {
        await mutateOAuthApi("DELETE", "playlistItems", { id: playlistItemId });
        return {
            content: [
                {
                    type: "text",
                    text: `Removed playlist item ${playlistItemId}.`,
                },
            ],
        };
    });
    // ── move_playlist_item ─────────────────────────────────────────────────────
    server.tool("move_playlist_item", "Move a video to a new position within a YouTube playlist. Use get_playlist_items to obtain the playlist item ID. Position is 0-based. Requires OAuth credentials (YOUTUBE_OAUTH_TOKEN_PATH).", {
        playlistId: z
            .string()
            .describe("Playlist ID that contains the item"),
        playlistItemId: z
            .string()
            .describe("Playlist item ID to move (from get_playlist_items)"),
        newPosition: z
            .number()
            .int()
            .min(0)
            .describe("New 0-based position for the video"),
    }, async ({ playlistId, playlistItemId, newPosition }) => {
        // Fetch current snippet to satisfy the PUT requirement (all snippet fields needed)
        const current = await fetchOAuthApi("playlistItems", {
            part: "snippet",
            id: playlistItemId,
        });
        const items = current.items ?? [];
        if (items.length === 0) {
            throw new Error(`Playlist item ${playlistItemId} not found.`);
        }
        const snippet = { ...items[0].snippet, position: newPosition, playlistId };
        await mutateOAuthApi("PUT", "playlistItems", { part: "snippet" }, { id: playlistItemId, snippet });
        return {
            content: [
                {
                    type: "text",
                    text: `Moved item ${playlistItemId} to position ${newPosition} in playlist ${playlistId}.`,
                },
            ],
        };
    });
}
//# sourceMappingURL=manage-playlist.js.map