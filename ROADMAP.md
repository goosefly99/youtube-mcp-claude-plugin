# youtube-mcp — Update Roadmap
Generated from run `data-etl-orchestrator-update-2026-04-13`

Source spec: `pipeline_mcp_data/specs/youtube-mcp-update-spec.json`
Codebase root: `C:\Users\olive\claude_projects\coding\agent_tools_dev\data_etl_orchestrator_dev\youtube_dev_api\youtube-mcp-dev`
Language: TypeScript ESM, Node >=22.5.0, zod ^3.24.0, @modelcontextprotocol/sdk ^1.12.0.

## Release position
**Stage 2 of 4 — ships in parallel with x-api-mcp, after agent-knowledgebase.**
- Gated by: agent-knowledgebase (the orchestrator's Stage-3 can't load until kb contracts are live; but youtube-mcp's server-local changes don't import kb).
- Gates: data-etl-orchestrator plugin's `ingest-youtube-playlist` and `ingest-youtube-videos` skills stop being a lie once `hydrate=true` and `includeTranscript=true` defaults are in effect.

## Blocking changes (must ship in this release)
- [x] **Batch up to 50 videoIds per `videos.list` call inside the hydrate path.** `services/videoService.ts` (or a new `services/videoBatchFetcher.ts`) must accept a list of videoIds and issue a single `videos.list?id=id1,id2,...` call per 50-chunk; the transcript fetches remain per-videoId through `transcriptService`. Source: debate round-1 critic + validation yt-03 (medium). Acceptance: a unit test issues hydrate over a 120-videoId playlist and asserts `videos.list` was invoked exactly 3 times (50+50+20); quota budget documented in `AGENTS.md`.
- [x] **Pin hydrate-loop concurrency to serial (`concurrency=1`) in release 1.** Document in `AGENTS.md` and as a constant in `videoService.ts`. No `Promise.all` over the item list. Source: debate round-1 synthesizer. Acceptance: trace / integration test shows sequential awaits; revisit only after measurement.
- [ ] **Define explicit retry semantics per transcript status value:**
  - `ok` — transcript fetched, persist transcripts row.
  - `missing` — captions disabled at source (e.g. `aDWJ6lLemJU`); DO NOT RETRY; persists videos row, no transcripts row.
  - `unavailable` — backend returned no data (deleted/region-locked); DO NOT RETRY at ingest time.
  - `failed` — transient backend error (network/timeout/5xx); RETRYABLE by caller on next run.
  - `skipped` — caller passed `includeTranscript=false`; no action.
  Source: debate round-1 synthesizer + orchestrator idempotency-and-dedup ref. Acceptance: documented in `AGENTS.md` and a TypeScript `TranscriptStatus` union type; `aDWJ6lLemJU` fixture returns `missing` not `failed`.
- [x] **Resolve `videosRepo` schema ambiguity with additive nullable columns.** Add `metadata_status TEXT NULL`, `transcript_status TEXT NULL`, `transcript_reason TEXT NULL` to `videos`. Migration is additive-only. Source: debate round-1 synthesizer (rejected the "if schema permits" conditional). Acceptance: schema migration applied on server boot via `initSchema`; `upsertVideo(db, {...statuses})` writes the new columns; existing rows retain NULL.
- [x] **Remove YouTube-API fetch code from `get_transcript`.** Tool delegates strictly to `transcriptsRepo.getByVideoId(db, videoId)`; returns `{videoId, transcript|null, status: 'ok'|'missing'}`. Source: spec + debate round-1 advocate. Acceptance: `rg -n 'transcriptService' src/tools/get_transcript.ts` returns zero matches; a cache-miss returns `status: 'missing'` with no outbound HTTP; smoke-test confirms DB is untouched by the tool.
- [ ] **Drop "streams" language from spec description / AGENTS.md.** MCP is single-shot request/response; only DB-write streaming is real. Say "per-item DB writes land as each item completes." Source: debate round-1 critic + cross-spec synthesis. Acceptance: grep for "streams" in AGENTS.md returns zero occurrences or only the clarifying paragraph.
- [ ] **Pinned test fixture for `aDWJ6lLemJU` (no-transcript) case.** Returns `metadata=ok, transcript=missing`; `videos` row lands; no transcripts row; MCP response is 2xx. Source: spec Phase 4 + debate. Acceptance: `tests/fixtures/videoService.test.ts` (or equivalent) with an `aDWJ6lLemJU` case.

## Recommended changes (ship if feasible)
- [ ] Machine-friendly summary block at end of `get_playlist_items` response: `{total, metadataOk, transcriptOk, transcriptMissing, transcriptFailed}`.
- [ ] Document per-playlist quota budget in `AGENTS.md` (worked example: 100-item playlist = 1 playlistItems.list + 2 videos.list = 3 units).
- [ ] `AGENTS.md` cross-reference to `data-etl-orchestrator/skills/references/mcp-tool-contracts.md` with git-sha pin (or commit-link).

## Accepted as-is
- Tool names unchanged (`get_video_details`, `get_playlist_items`, `get_transcript`).
- Backward-compat: `includeTranscript=false` and `hydrate=false` still work with original behavior.
- DB convention: `getDb()` only, `INSERT OR REPLACE INTO`, try/catch → stderr, ISO `saved_at`, null-not-undefined.
- No new transcript backends / no new third-party transcript providers.
- No changes to authentication / quota handling.
- No schema-breaking DB changes (only additive nullable columns).

## Phased work breakdown

### Phase 1 — Audit
- files to read: `src/tools/get_video_details.ts`, `src/tools/get_playlist_items.ts`, `src/tools/get_transcript.ts`, `src/services/videoService.ts`, `src/services/transcriptService.ts`, `src/db/repos/videosRepo.ts`, `src/db/repos/transcriptsRepo.ts`, `AGENTS.md`
- deliverable: audit note listing pre-existing vs net-new behavior for each tool/service/repo.
- verification: none beyond note commit.

### Phase 2 — VideoService unification + videoId batching
- files to touch: `src/services/videoService.ts` (or new `videoBatchFetcher.ts`), `src/tools/get_video_details.ts`, `src/tools/get_playlist_items.ts`
- tests to add: unit test for the 50-chunk batching; integration test that hydrate path does not loop `get_transcript`
- verification: `npx tsc --noEmit`; `npx eslint . --quiet`; batch-count assertion test passes.

### Phase 3 — Demote `get_transcript` to cache-read accessor
- files to touch: `src/tools/get_transcript.ts`, zod schema for its input/output, `AGENTS.md`
- tests to add: cache-miss test returns `status: 'missing'` with no HTTP call; cache-hit test returns stored row.
- verification: `rg -n 'transcriptService|youtube' src/tools/get_transcript.ts` shows no API import; tests pass.

### Phase 4 — Status envelope + schema migration
- files to touch: `src/db/repos/videosRepo.ts`, `src/db/repos/transcriptsRepo.ts`, schema-init in `src/db/schema.ts` (or equivalent), shared type `src/types/status.ts` (new)
- tests to add: `aDWJ6lLemJU` fixture (no-transcript); schema-migration idempotency test (run twice, assert no error).
- verification: `npx tsc --noEmit`; `npx eslint .`; fixture test passes.

### Phase 5 — Defaults + AGENTS.md alignment
- files to touch: zod schemas for all three tools; `AGENTS.md`
- verification: `includeTranscript` and `hydrate` default to `true` in the schema; `AGENTS.md` states retry-behavior table, quota budget, cache-read-only note.

### Phase 6 — Smoke + type-check
- verification:
  - `npx tsc --noEmit`
  - `npx eslint . --quiet` (or project lint)
  - Smoke: `get_video_details` on a known-good videoId; on `aDWJ6lLemJU` (transcript missing); `get_playlist_items` on a small playlist; `get_transcript` on a cached vs uncached videoId. Confirm DB rows and statuses match expectations.

## Cross-plugin dependencies
- **This plugin's changes gate:**
  - `data-etl-orchestrator` — `ingest-youtube-playlist` and `ingest-youtube-videos` skills rely on `hydrate=true` / `includeTranscript=true` defaults and the `{metadata, transcript, statuses}` envelope.
- **This plugin is gated by:** nothing functional, but SHOULD ship after agent-knowledgebase so end-to-end orchestrator runs can load into kb.

## Verification commands
```bash
npx tsc --noEmit
npx eslint . --quiet
# If jest/vitest:
npm test
# Smoke:
node dist/index.js  # start MCP server
# then exercise get_video_details / get_playlist_items / get_transcript via MCP client
```

## Out of scope
- No new transcript backends or third-party transcript providers.
- No changes to authentication / OAuth / quota handling.
- No schema-breaking DB changes (only additive nullable columns).
- No batching parallelism beyond the existing sequential behavior (concurrency=1 is pinned).
- No per-item streaming over MCP transport — MCP is single-shot, only DB writes stream.
- No expansion of `get_transcript` beyond cache read.
