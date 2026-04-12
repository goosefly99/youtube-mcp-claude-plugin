import type { DatabaseSync } from "node:sqlite";
import type { PlaylistRow, PlaylistItemRow } from "../types.js";
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
export declare function upsertPlaylist(db: DatabaseSync, pl: PlaylistInput): void;
export declare function upsertPlaylists(db: DatabaseSync, playlists: PlaylistInput[]): void;
export declare function upsertPlaylistItem(db: DatabaseSync, item: PlaylistItemInput): void;
export declare function upsertPlaylistItems(db: DatabaseSync, items: PlaylistItemInput[]): void;
export declare function queryPlaylists(db: DatabaseSync, opts?: QueryPlaylistsOpts): PlaylistRow[];
export declare function queryPlaylistItems(db: DatabaseSync, opts?: QueryPlaylistItemsOpts): PlaylistItemRow[];
