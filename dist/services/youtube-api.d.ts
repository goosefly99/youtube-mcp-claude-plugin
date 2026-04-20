import type { VideoSearchResult, VideoDetails } from "../types.js";
export declare function parseVideoId(input: string): string;
export declare function parseDuration(iso: string): string;
export declare function searchVideos(query: string, maxResults?: number): Promise<VideoSearchResult[]>;
export declare function getVideoDetails(videoId: string): Promise<VideoDetails>;
export declare function getVideoComments(videoId: string, maxResults?: number): Promise<string[]>;
