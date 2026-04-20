import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseSync } from "node:sqlite";
export interface GetTranscriptInput {
    videoId: string;
}
export interface GetTranscriptResult {
    videoId: string;
    transcript: string | null;
    status: "ok" | "missing";
}
export declare function handleGetTranscript(input: GetTranscriptInput, db: DatabaseSync, _fetchTranscript?: (videoId: string) => Promise<unknown>): Promise<GetTranscriptResult>;
export declare function registerGetTranscriptTool(server: McpServer): void;
