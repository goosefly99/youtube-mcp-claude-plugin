# Changelog

All notable changes to `youtube-mcp` are recorded here. The format follows
Keep a Changelog (https://keepachangelog.com/) conventions.

## Unreleased

### Added

- **New tool `get_new_playlist_items`** — incremental playlist ingestion
  that diffs a live YouTube playlist against the local SQLite cache and
  hydrates only the videos still needing ingestion. The diff predicate
  follows `docs/transcript-retry-semantics.md`: missing `videos` row,
  `metadata_status != 'ok'`, or transcript-retryable
  (`transcript_status` ∈ {null, pending, failed} with no `transcripts`
  row). Quota cost: `ceil(N/50)` playlistItems.list + `ceil(M/50)`
  videos.list, where `M ≤ N` is the candidate count. Closes the gap that
  forced agents to drop into raw SQL to find unfetched videos.
  - `hydrate=true` (default): batches metadata for the diff set and runs
    the same serial transcript loop as `get_playlist_items`, with
    structured per-candidate outcomes.
  - `hydrate=false`: returns the diff list with zero `videos.list` calls.
- `getVideoHydrationStates` repo helper (`src/db/repos/videos.ts`) — single
  parameterized query that joins `videos` + `transcripts` to surface a
  per-id state object (`hasVideoRow`, `metadataStatus`, `hasTranscriptRow`,
  `transcriptStatus`).
- Test file `src/tests/getNewPlaylistItems.test.ts` covering all branches
  of the `decideHydration` predicate, the summary roll-up, and the DB
  query helper.

## 0.5.0 — 2026-04-20

### Added

- `src/services/transcriptClassifier.ts` — shared `classifyTranscriptError`
  helper that consolidates the two previously duplicated inline matcher
  blocks in `get-video-details.ts` and `get-playlist-items.ts` into a
  single source of truth for transcript-fetch error classification.
- `VideoDetails.channelId` field (`string | null`) propagated from the
  `videos.list` API (`snippet.channelId`) through `videoBatchFetcher` and
  `youtube-api.getVideoDetails`.
- `docs/transcript-retry-semantics.md` — authoritative per-status retry
  table, caller retry policy, stability guarantees, and DB-mapping notes
  for `toDbTranscriptStatus`.
- Additive `summary` block on the `get_playlist_items` response
  (`{total, metadataOk, transcriptOk, transcriptMissing, transcriptFailed}`)
  exposed via `structuredContent.summary` and as a sibling top-level key.
  Existing text content and fields are unchanged.
- Pinned fixture test `src/tests/aDWJ6lLemJU.test.ts` that pins the
  no-transcript classification path.
- Tests: `transcriptClassifier.test.ts`, `channelId.test.ts`,
  `hydrateLoop.test.ts`, `playlistSummary.test.ts`.
- `FetchAndStoreOpts` on `fetchAndStoreVideo` (preFetchedDetails, source,
  transcriptFetcher) — test seam + hydrate-loop reunification surface.

### Changed

- `get-playlist-items.ts` hydrate loop reunified: the per-video Step 2
  loop now delegates to `fetchAndStoreVideo(id, true, {preFetchedDetails,
  source: "get_playlist_items"})`. Serial ordering
  (`HYDRATE_TRANSCRIPT_CONCURRENCY = 1`) and the `2*ceil(N/50)` quota
  formula are preserved — `preFetchedDetails` guarantees no extra
  videos.list calls per video.
- `src/db/repos/videos.ts` (line ~82 previously) now writes
  `video.channelId ?? null` instead of a hardcoded `null`. The multi-line
  TODO comment is removed.
- Transcript-error classifier narrows prior substring matching: only
  `no captions` / `captions disabled` / `http 404` route to `missing`;
  all other phrases now land in `failed` (previously `unavailable` or
  ad-hoc variants). This is the spec-normative single source of truth.

### Version

- `package.json` version: `1.0.0` → `0.5.0` to align with cross-plugin
  spec release convention. (No runtime/schema break; additive type/column
  changes only.)
