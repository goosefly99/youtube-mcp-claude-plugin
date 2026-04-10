#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// Validate config at startup (exits with error if YOUTUBE_API_KEY is missing)
await import("./config.js");

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("YouTube MCP server running on stdio");
