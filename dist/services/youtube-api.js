import { config } from "../config.js";
async function fetchYouTubeApi(endpoint, params) {
    const url = new URL(`${config.youtubeApiBaseUrl}/${endpoint}`);
    url.searchParams.set("key", config.youtubeApiKey);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    const response = await fetch(url.toString());
    const data = (await response.json());
    if (!response.ok) {
        const error = data.error;
        const message = error?.message ?? `YouTube API error: ${response.status}`;
        throw new Error(String(message));
    }
    return data;
}
export function parseVideoId(input) {
    const trimmed = input.trim();
    // Try parsing as URL
    try {
        const url = new URL(trimmed);
        if (url.hostname === "youtu.be") {
            return url.pathname.slice(1);
        }
        if (url.hostname === "www.youtube.com" ||
            url.hostname === "youtube.com" ||
            url.hostname === "m.youtube.com") {
            if (url.pathname === "/watch") {
                return url.searchParams.get("v") ?? trimmed;
            }
            const embedMatch = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
            if (embedMatch)
                return embedMatch[1];
            const shortsMatch = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
            if (shortsMatch)
                return shortsMatch[1];
        }
    }
    catch {
        // Not a URL, treat as bare ID
    }
    // Bare video ID (11 characters)
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return trimmed;
    }
    return trimmed;
}
export function parseDuration(iso) {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match)
        return iso;
    const h = match[1] ? `${match[1]}h ` : "";
    const m = match[2] ? `${match[2]}m ` : "";
    const s = match[3] ? `${match[3]}s` : "";
    return (h + m + s).trim() || "0s";
}
export async function searchVideos(query, maxResults = 5) {
    const searchData = await fetchYouTubeApi("search", {
        part: "snippet",
        type: "video",
        q: query,
        maxResults: String(maxResults),
    });
    const items = searchData.items ?? [];
    if (items.length === 0)
        return [];
    // Fetch statistics for all videos in one call
    const videoIds = items.map((item) => item.id.videoId).join(",");
    const statsData = await fetchYouTubeApi("videos", {
        part: "statistics",
        id: videoIds,
    });
    const statsMap = new Map();
    for (const item of statsData.items ?? []) {
        statsMap.set(item.id, item.statistics);
    }
    return items.map((item) => {
        const stats = statsMap.get(item.id.videoId);
        return {
            videoId: item.id.videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            description: item.snippet.description,
            publishedAt: item.snippet.publishedAt,
            thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? "",
            viewCount: stats?.viewCount,
            likeCount: stats?.likeCount,
        };
    });
}
export async function getVideoDetails(videoId) {
    const id = parseVideoId(videoId);
    const data = await fetchYouTubeApi("videos", {
        part: "snippet,contentDetails,statistics",
        id,
    });
    const items = data.items ?? [];
    if (items.length === 0) {
        throw new Error(`Video not found: ${id}`);
    }
    const item = items[0];
    return {
        videoId: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? "",
        duration: parseDuration(item.contentDetails.duration),
        tags: item.snippet.tags ?? [],
        categoryId: item.snippet.categoryId,
        defaultLanguage: item.snippet.defaultLanguage,
        statistics: {
            viewCount: item.statistics.viewCount ?? "0",
            likeCount: item.statistics.likeCount ?? "0",
            commentCount: item.statistics.commentCount ?? "0",
        },
    };
}
export async function getVideoComments(videoId, maxResults = 50) {
    const id = parseVideoId(videoId);
    try {
        const data = await fetchYouTubeApi("commentThreads", {
            part: "snippet",
            videoId: id,
            maxResults: String(maxResults),
            order: "relevance",
        });
        const items = data.items ?? [];
        return items.map((item) => item.snippet.topLevelComment.snippet.textDisplay);
    }
    catch (error) {
        if (error instanceof Error &&
            error.message.includes("disabled")) {
            return [];
        }
        throw error;
    }
}
//# sourceMappingURL=youtube-api.js.map