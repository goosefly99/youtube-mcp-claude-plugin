import { z } from "zod";
import { getVideoDetails } from "../services/youtube-api.js";
export function registerGetVideoDetailsTool(server) {
    server.tool("get_video_details", "Get detailed metadata for a YouTube video including title, description, duration, statistics, and tags.", {
        videoId: z
            .string()
            .describe("YouTube video ID or full URL"),
    }, async ({ videoId }) => {
        const details = await getVideoDetails(videoId);
        const views = Number(details.statistics.viewCount).toLocaleString();
        const likes = Number(details.statistics.likeCount).toLocaleString();
        const comments = Number(details.statistics.commentCount).toLocaleString();
        const text = [
            `Title: ${details.title}`,
            `Channel: ${details.channelTitle}`,
            `URL: https://youtube.com/watch?v=${details.videoId}`,
            `Duration: ${details.duration}`,
            `Published: ${new Date(details.publishedAt).toLocaleDateString()}`,
            ``,
            `Statistics:`,
            `  Views: ${views}`,
            `  Likes: ${likes}`,
            `  Comments: ${comments}`,
            ``,
            details.tags.length > 0
                ? `Tags: ${details.tags.join(", ")}`
                : "Tags: none",
            ``,
            `Description:`,
            details.description,
        ].join("\n");
        return { content: [{ type: "text", text }] };
    });
}
//# sourceMappingURL=get-video-details.js.map