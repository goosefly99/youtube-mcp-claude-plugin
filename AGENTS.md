# AGENTS.md — youtube-mcp

## Project Overview

youtube-mcp is a Model Context Protocol (MCP) server plugin that exposes YouTube Data API v3 and InnerTube transcript fetching as MCP tools. It runs over stdio transport only (no HTTP server), stores fetched data locally in a SQLite database via Node.js 22.5+'s built-in `node:sqlite` module, and exposes tools for searching videos, fetching transcripts, managing playlists (with OAuth), and querying the local cache. The server is registered in `src/server.ts::createServer()`, which initialises the DB and then calls each tool's register function.

---

## Stack

| Concern | Technology |
|---|---|
| Language | TypeScript 5.7+ — strict mode enabled |
| Runtime | Node.js 22.5+ (ESM, `type: module` in package.json) |
| Module resolution | `Node16` — `.js` extension required on every local import |
| MCP SDK | `@modelcontextprotocol/sdk ^1.12.0` |
| Validation | `zod ^3.24.0` |
| Database | `node:sqlite` built-in — no external SQLite bindings |
| HTTP | Global `fetch` (Node 22+) — no axios, no node-fetch |
| Build | `tsc` targeting ES2022; output to `dist/` |
| Tests | `vitest` (to be added in Phase 5) |

---

## Critical Conventions

### Import style
All local imports **must** use the `.js` extension, even when importing `.ts` source files. This is required by ESM + Node16 moduleResolution.

```ts
// Correct
import { getDb } from '../db/connection.js';
import { upsertSearchResults } from '../db/repos/videos.js';

// Wrong — will fail at runtime
import { getDb } from '../db/connection';
```

### Adding a new tool
1. Create `src/tools/{kebab-case-name}.ts`
2. Export exactly one function: `export function registerXxxTool(server: McpServer): void`
3. Inside, call `server.tool(name, description, zodSchema, asyncHandler)` — one call per tool
4. Import the register function in `src/server.ts` and call it from `createServer()`

```ts
// src/tools/my-tool.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerMyTool(server: McpServer): void {
  server.tool(
    'my_tool',                      // snake_case MCP name
    'What this tool does.',
    { videoId: z.string() },
    async ({ videoId }) => {
      // ... do work ...
      return { content: [{ type: 'text', text: '...' }] };
    }
  );
}
```

### Tool handler return shape
Every tool handler **must** return `{ content: [{ type: "text", text: "..." }] }`. No other shapes are accepted by the MCP framework.

### DB failure handling — non-fatal
DB operations in tool handlers are wrapped in `try/catch` and are **never** allowed to throw. Errors go to `process.stderr` only.

```ts
try {
  upsertVideo(getDb(), video, 'my-tool');
} catch (err) {
  process.stderr.write(`youtube-mcp: DB upsert failed (my_tool): ${err}\n`);
}
```

### Logging
Log **only** to `process.stderr`. Stdout is reserved for the MCP stdio transport — anything written there corrupts the protocol.

Format: `youtube-mcp: <context> <message>`

```ts
process.stderr.write(`youtube-mcp: search_videos DB failed: ${err}\n`);
// or equivalently:
console.error(`youtube-mcp: search_videos DB failed: ${err}`);
```

### New tables and indexes
All DDL goes inside `src/db/schema.ts::initSchema()`, appended to the existing `db.exec(...)` block. Every statement **must** use `IF NOT EXISTS`.

```ts
// Inside the db.exec(` ... `) block in initSchema():
CREATE TABLE IF NOT EXISTS comments (
  comment_id  TEXT PRIMARY KEY,
  video_id    TEXT NOT NULL,
  ...
);
CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments(video_id);
```

### New DB repo files
Create `src/db/repos/{name}.ts`. Follow the pattern in `src/db/repos/videos.ts`:
- Accept `db: DatabaseSync` as first argument
- Use `db.prepare(...).run(...)` for writes, `db.prepare(...).all(...)` for reads
- Export named functions: `verbNoun` style (`upsertComment`, `queryComments`)
- Use `COALESCE(excluded.col, table.col)` in `ON CONFLICT DO UPDATE` to preserve richer existing data
- Types/interfaces exported from the same file or from `src/db/types.ts`

### OAuth tools
Tools that require OAuth must be registered **conditionally** inside the `if (config.oauthTokenPath) { ... }` block in `src/server.ts`. Never register OAuth tools unconditionally.

### Build verification
Always run `npm run build` after changes. All TypeScript errors must be resolved before reporting work complete.

---

## The 6 Planned Improvements

### 1. Cross-platform DB path (`src/db/connection.ts`)

**Current problem:** `DEFAULT_DB_DIR = 'W:\\youtube_mcp_db'` — Windows-only, fails on macOS/Linux.

**Fix:**
- Import `os` from `'node:os'`
- Replace `DEFAULT_DB_DIR` with `path.join(os.homedir(), '.youtube-mcp')`
- Replace `DEFAULT_DB_PATH` with `path.join(DEFAULT_DB_DIR, 'youtube-data.db')`
- The existing `IS_DEFAULT_PATH` guard and `fs.mkdirSync(..., { recursive: true })` call continue to work unchanged
- Update the JSDoc comment on `getDb()` to reflect the new default path

New default resolves to:
- macOS/Linux: `~/.youtube-mcp/youtube-data.db`
- Windows: `%USERPROFILE%\.youtube-mcp\youtube-data.db`

### 2. FTS5 transcript search

**Files:** `src/db/schema.ts`, `src/db/repos/transcripts.ts`, `src/tools/search-transcripts.ts`, `src/server.ts`

**Schema additions** — append to `initSchema()`:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts
  USING fts5(video_id UNINDEXED, language UNINDEXED, full_text,
             content='transcripts', content_rowid='rowid');

CREATE TRIGGER IF NOT EXISTS trg_transcripts_ai
  AFTER INSERT ON transcripts BEGIN
    INSERT INTO transcripts_fts(rowid, video_id, language, full_text)
    VALUES (NEW.rowid, NEW.video_id, NEW.language, NEW.full_text);
  END;

CREATE TRIGGER IF NOT EXISTS trg_transcripts_au
  AFTER UPDATE ON transcripts BEGIN
    INSERT INTO transcripts_fts(transcripts_fts, rowid, video_id, language, full_text)
    VALUES ('delete', OLD.rowid, OLD.video_id, OLD.language, OLD.full_text);
    INSERT INTO transcripts_fts(rowid, video_id, language, full_text)
    VALUES (NEW.rowid, NEW.video_id, NEW.language, NEW.full_text);
  END;

CREATE TRIGGER IF NOT EXISTS trg_transcripts_ad
  AFTER DELETE ON transcripts BEGIN
    INSERT INTO transcripts_fts(transcripts_fts, rowid, video_id, language, full_text)
    VALUES ('delete', OLD.rowid, OLD.video_id, OLD.language, OLD.full_text);
  END;
```

After the triggers, run a one-time backfill (guarded by schema_version check):

```ts
// After inserting schema_version row (cnt === 0 guard), also backfill FTS:
db.exec(`INSERT INTO transcripts_fts(rowid, video_id, language, full_text)
         SELECT rowid, video_id, language, full_text FROM transcripts`);
```

**Repo function** — add to `src/db/repos/transcripts.ts`:

```ts
export interface TranscriptSearchResult {
  videoId: string;
  language: string;
  isAutoGenerated: boolean;
  snippet: string;
  videoTitle: string | null;
  savedAt: string;
}

export function searchTranscriptsFts(
  db: DatabaseSync,
  query: string,
  opts: { language?: string; limit?: number; offset?: number; snippetLength?: number }
): TranscriptSearchResult[]
```

Join pattern — **must** use rowid, not composite key:

```sql
SELECT t.video_id, t.language, t.is_auto_generated, t.saved_at,
       v.title as video_title,
       snippet(transcripts_fts, 2, '<b>', '</b>', '...', 20) as snippet
FROM transcripts_fts fts
JOIN transcripts t ON t.rowid = fts.rowid
LEFT JOIN videos v ON v.video_id = t.video_id
WHERE transcripts_fts MATCH ?
  [AND t.language = ?]
ORDER BY rank
LIMIT ? OFFSET ?
```

**Tool:** `search_transcripts` — register in `src/server.ts` alongside other public tools.

### 3. `get_channel_videos` tool (`src/tools/get-channel-videos.ts`)

- Accept `channelId: string` (bare ID or full channel URL — extract the ID)
- Accept `maxResults: number` (1–50, default 25)
- API flow: `channels?part=contentDetails&id={channelId}` → extract `items[0].contentDetails.relatedPlaylists.uploads` → `playlistItems?part=snippet,contentDetails&playlistId={uploadsId}&maxResults={maxResults}`
- Add service functions to `src/services/youtube-api.ts`:
  - `getChannelUploadsPlaylistId(channelId: string): Promise<string>`
  - `getChannelVideos(channelId: string, maxResults: number): Promise<VideoSearchResult[]>`
- Persist results via `upsertSearchResults(getDb(), results, 'channel')` (existing function)
- Auth: API key only — register unconditionally in `createServer()`
- **Do not** use `search.list` for channel video fetching — it costs 100 quota units; `playlistItems.list` costs 1 unit per page

### 4. `get_video_comments` tool

**Files:** `src/db/repos/comments.ts` (new), `src/tools/get-video-comments.ts` (new), `src/db/schema.ts` (new table)

**New `comments` table** — add to `initSchema()`:

```sql
CREATE TABLE IF NOT EXISTS comments (
  comment_id   TEXT PRIMARY KEY,
  video_id     TEXT NOT NULL,
  text         TEXT,
  author       TEXT,
  like_count   INTEGER,
  published_at TEXT,
  saved_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments(video_id);
```

**Repo file** `src/db/repos/comments.ts`:
- Export `upsertComments(db, comments): void` — batch insert with `ON CONFLICT(comment_id) DO UPDATE`
- Export `queryComments(db, videoId, limit): CommentRow[]`

**Service:** Reuse `getVideoComments(videoId, maxResults)` already in `src/services/youtube-api.ts` at line 179. Do not modify the service function.

**Tool handler:**
- Parse the input videoId (strip URL if needed) with `parseVideoId()` before any DB lookup or API call
- Call `getVideoComments(videoId, maxResults)` (returns `string[]` — comment text array)
- Persist to `comments` table
- Input: `videoId: string`, `maxResults: number` (1–100, default 20)
- Register unconditionally in `createServer()`

### 5. Fix `channel_id` in `upsertVideo` (`src/db/repos/videos.ts` line 61)

**Current:** `channel_id: null` — hardcoded, ignores the channelId field even when present.

**Fix (three steps):**

1. Add `channelId?: string` to the `VideoDetails` interface in `src/types.ts`
2. In `src/services/youtube-api.ts`, parse `item.snippet.channelId` in `getVideoDetails()` and include it in the returned object — also add `channelId?: string` to the `VideoItem` snippet interface
3. In `src/db/repos/videos.ts` line 61, change `channel_id: null` → `channel_id: video.channelId ?? null`

The existing `COALESCE(excluded.channel_id, videos.channel_id)` in the conflict clause already handles preservation correctly — no changes needed there.

### 6. Vitest test suite

**Setup:**

```bash
npm install --save-dev vitest @vitest/coverage-v8
```

**`vitest.config.ts`** — required configuration for Node16 ESM projects:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**'],
    },
  },
  resolve: {
    conditions: ['node', 'import', 'module', 'default'],
  },
});
```

The `resolve.conditions` setting is **required** — without it, `.js` extension imports in test files will not resolve to `.ts` source files.

**API mocking:** Use `vi.stubGlobal('fetch', vi.fn())` — do not use `msw` unless explicitly approved. Keep mocks inline in each test file.

**DB testing:** Use `new DatabaseSync(':memory:')` + `initSchema(db)` for an isolated in-memory DB per test suite.

**Test files to create:**

| File | What it tests |
|---|---|
| `src/__tests__/db/videos.test.ts` | `upsertVideo`, `upsertSearchResults`, `queryVideos` — channel_id fix coverage |
| `src/__tests__/db/transcripts.test.ts` | `upsertTranscript`, `searchTranscriptsFts` — FTS5 sync triggers |
| `src/__tests__/tools/search-videos.test.ts` | `registerSearchVideosTool` handler — mocked `fetch`, mocked DB |

Add a `test` script to `package.json`:

```json
"test": "vitest run",
"test:coverage": "vitest run --coverage"
```

---

## Build and Verify

After every change, run:

```bash
npm run build
```

Fix all TypeScript errors before marking work complete. There is no linter configured beyond `tsc --noEmit` (the build step). If `npm run build` exits non-zero, the work is not done.

---

## Branch

All work happens on the `auto_dev` branch. Never commit to `main`. The `auto_dev` branch has a `plugin.json` with a `-auto-dev` suffix name — do not change the `name` field in `.claude-plugin/plugin.json` when merging or rebasing.
