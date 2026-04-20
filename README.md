# youtube-mcp-claude-plugin

MCP server for YouTube search, transcripts, and video analysis — packaged as a Claude Code plugin.

## What it does

Exposes the YouTube Data API v3 to Claude Code as a set of Model Context Protocol tools, so Claude can search videos, pull metadata and transcripts, and perform deeper content analysis on demand.

Tools exposed:

| Tool | Description |
|------|-------------|
| `search_videos` | Search YouTube for videos matching a query |
| `get_video_details` | Get detailed metadata for a specific video |
| `get_transcript` | Fetch video transcript/captions with timestamps |
| `summarize_video` | Structured summary with key topics and sections |
| `analyze_video` | Deep analysis: themes, comment sentiment, key moments |

Prompts exposed:

| Prompt | Description |
|--------|-------------|
| `summarize` | Step-by-step video summarization workflow |
| `analyze` | Deep content analysis workflow |
| `compare` | Side-by-side comparison of multiple videos |

## Installation

Install via Claude Code's plugin manager:

```
/plugin install goosefly99/youtube-mcp-claude-plugin
```

Or clone directly:

```bash
git clone https://github.com/goosefly99/youtube-mcp-claude-plugin.git
```

The compiled `dist/` directory ships committed in this repository, so no build step is required after cloning. Claude Code will pick up `.mcp.json` and launch the server via `node ${CLAUDE_PLUGIN_ROOT}/dist/index.js`.

## Configuration

The server requires a single environment variable:

| Variable | Required | Description |
|----------|----------|-------------|
| `YOUTUBE_API_KEY` | Yes | A YouTube Data API v3 key (free tier: 10,000 units/day) |

To obtain a key:

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable **YouTube Data API v3** under **APIs & Services > Library**.
4. Create an API key under **APIs & Services > Credentials**.
5. (Optional) Restrict the key to the YouTube Data API v3.

Copy `.env.example` to `.env` and set `YOUTUBE_API_KEY`, or pass the variable through your MCP client's environment configuration. The server exits at startup if the key is missing.

## Ecosystem version floor

This plugin ships as **v0.5.0** as part of the v0.3.0 sibling ecosystem drop
(kb 0.6.0 + yt 0.5.0 + x-api 0.4.0). The `data-etl-orchestrator` contract
probe (probe 4, ensemble-contract) refuses to dispatch unless
`youtube-mcp >= 0.5.0`. If you pin an older version, the orchestrator will
emit a structured upgrade message telling the user to install v0.5.0.
See `skills/references/contract-probe-protocol.md` in the orchestrator
repo for the full probe. Consumer-side every-call stderr capture
requirements are documented in `AGENTS.md`.

## Development

Source lives under `src/` (TypeScript, ESM, Node16 module resolution). To modify:

```bash
npm install
# edit src/...
npm run build      # compile to dist/
npm run dev        # watch mode
npm start          # run the compiled server
```

Because `dist/` is committed, rebuild and commit the regenerated `dist/` whenever source changes are pushed, so installers continue to get a runnable plugin.

Runtime dependencies are intentionally minimal:

- `@modelcontextprotocol/sdk` — Official MCP SDK
- `zod` — Schema validation

All HTTP calls use the Node.js built-in `fetch`. Transcript fetching is hand-rolled with no third-party libraries.

## Requirements

- Node.js 18 or newer (for built-in `fetch`)
- A valid YouTube Data API v3 key
