import { z } from "zod";
export function registerSummarizePrompt(server) {
    server.prompt("summarize", "Generate a comprehensive summary of a YouTube video", { url: z.string().describe("YouTube video URL or ID") }, async ({ url }) => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: [
                        `Please summarize the YouTube video: ${url}`,
                        ``,
                        `Use the following tools in order:`,
                        `1. get_video_details — to get the video's metadata`,
                        `2. get_transcript — to fetch the full transcript`,
                        ``,
                        `Then provide:`,
                        `1. **Overview** — A one-paragraph summary of what the video covers`,
                        `2. **Key Topics** — Bulleted list of the main topics discussed`,
                        `3. **Main Points with Timestamps** — The most important points with their approximate timestamps`,
                        `4. **Notable Quotes** — Any standout statements or claims made`,
                        `5. **Takeaway** — The single most important thing a viewer should remember`,
                    ].join("\n"),
                },
            },
        ],
    }));
}
//# sourceMappingURL=summarize.js.map