import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchVideosTool } from "./tools/search-videos.js";
import { registerGetVideoDetailsTool } from "./tools/get-video-details.js";
import { registerGetTranscriptTool } from "./tools/get-transcript.js";
import { registerSummarizeVideoTool } from "./tools/summarize-video.js";
import { registerAnalyzeVideoTool } from "./tools/analyze-video.js";
import { registerSummarizePrompt } from "./prompts/summarize.js";
import { registerAnalyzePrompt } from "./prompts/analyze.js";
import { registerComparePrompt } from "./prompts/compare.js";
export function createServer() {
    const server = new McpServer({
        name: "youtube-mcp",
        version: "1.0.0",
    });
    // Tools
    registerSearchVideosTool(server);
    registerGetVideoDetailsTool(server);
    registerGetTranscriptTool(server);
    registerSummarizeVideoTool(server);
    registerAnalyzeVideoTool(server);
    // Prompts
    registerSummarizePrompt(server);
    registerAnalyzePrompt(server);
    registerComparePrompt(server);
    return server;
}
//# sourceMappingURL=server.js.map