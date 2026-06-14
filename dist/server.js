import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "./config.js";
import { registerSearchVideosTool } from "./tools/search-videos.js";
import { registerGetVideoDetailsTool } from "./tools/get-video-details.js";
import { registerGetTranscriptTool } from "./tools/get-transcript.js";
import { registerSummarizeVideoTool } from "./tools/summarize-video.js";
import { registerAnalyzeVideoTool } from "./tools/analyze-video.js";
import { registerListPlaylistsTool } from "./tools/list-playlists.js";
import { registerGetPlaylistItemsTool } from "./tools/get-playlist-items.js";
import { registerGetNewPlaylistItemsTool } from "./tools/get-new-playlist-items.js";
import { registerManagePlaylistTools } from "./tools/manage-playlist.js";
import { registerGetSavedVideosTool } from "./tools/get-saved-videos.js";
import { registerGetSavedTranscriptsTool } from "./tools/get-saved-transcripts.js";
import { registerGetSavedPlaylistsTool } from "./tools/get-saved-playlists.js";
import { registerSummarizePrompt } from "./prompts/summarize.js";
import { registerAnalyzePrompt } from "./prompts/analyze.js";
import { registerComparePrompt } from "./prompts/compare.js";
import { getDb, getDbPath } from "./db/connection.js";
import { initSchema } from "./db/schema.js";
export function createServer() {
    const server = new McpServer({
        name: "youtube-mcp",
        version: "1.0.0",
    });
    // Initialize the local SQLite cache before registering tools.
    // Failures here are logged but do not block server startup — tools that
    // try to persist will surface their own errors to stderr.
    try {
        const db = getDb();
        initSchema(db);
        const videoCount = db.prepare("SELECT COUNT(*) as n FROM videos").get().n;
        const transcriptCount = db.prepare("SELECT COUNT(*) as n FROM transcripts").get().n;
        const playlistCount = db.prepare("SELECT COUNT(*) as n FROM playlists").get().n;
        console.error(`youtube-mcp: DB ready at ${getDbPath()} (videos: ${videoCount}, transcripts: ${transcriptCount}, playlists: ${playlistCount})`);
    }
    catch (err) {
        console.error(`youtube-mcp: DB init failed (continuing without persistence): ${err}`);
    }
    // Tools — public (API key only)
    registerSearchVideosTool(server);
    registerGetVideoDetailsTool(server);
    registerGetTranscriptTool(server);
    registerSummarizeVideoTool(server);
    registerAnalyzeVideoTool(server);
    // Tools — local SQL cache (read-only)
    registerGetSavedVideosTool(server);
    registerGetSavedTranscriptsTool(server);
    registerGetSavedPlaylistsTool(server);
    // Tools — OAuth playlist management (only when token path is configured)
    if (config.oauthTokenPath) {
        registerListPlaylistsTool(server);
        registerGetPlaylistItemsTool(server);
        registerGetNewPlaylistItemsTool(server);
        registerManagePlaylistTools(server);
        console.error("YouTube OAuth playlist tools enabled.");
    }
    // Prompts
    registerSummarizePrompt(server);
    registerAnalyzePrompt(server);
    registerComparePrompt(server);
    return server;
}
//# sourceMappingURL=server.js.map