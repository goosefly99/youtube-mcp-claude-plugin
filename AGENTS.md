# AGENTS.md — youtube-mcp

## Purpose

youtube-mcp exposes YouTube Data API v3 and InnerTube transcript fetching as
MCP tools. Post-update, the tool contracts are **consolidated**: a single API
call corresponds to a single DB insert, and per-item hydration (metadata +
transcript) happens server-side so orchestrating agents never need to loop
`get_transcript` after `get_video_details`.

The authoritative consumer of these contracts is the `data-etl-orchestrator`
plugin. Any change here must preserve the semantics it depends on.

## Canonical fetch entrypoints

### `get_video_details(videoId, includeTranscript=true)`
The canonical fetch entrypoint for a **single** video.
- `includeTranscript=true` (default): fetches metadata AND transcript in one
  call, upserting both the `videos` row and the `transcripts` row.
- `includeTranscript=false`: metadata-only; transcript status is `skipped`.
- Partial success is supported: if metadata succeeds but transcript fetching
  fails or is unavailable, the tool still returns successfully and the video
  row is persisted. Only a metadata failure surfaces as a thrown error.

### `get_playlist_items(playlistId, hydrate=true)`
The canonical fetch entrypoint for a **whole** playlist.
- `hydrate=true` (default): for each playlist item, sequentially calls the
  same internal helper as `get_video_details(includeTranscript=true)`,
  upserting metadata + transcript for every video.
- `hydrate=false`: list-only behavior (original thin upsert from
  `playlistItems.list`); no transcript fetch is performed.

### `get_new_playlist_items(playlistId, hydrate=true)`
The **incremental** entrypoint for a playlist — fetches only the items not
already present in the local SQLite cache.
- Always calls `playlistItems.list` (paginated) and refreshes the
  `playlist_items` link table so the local mapping reflects the live
  playlist.
- Diffs the live video_ids against `videos` + `transcripts` to compute the
  candidate set per the predicate documented in
  `docs/transcript-retry-semantics.md`:
  - No `videos` row → candidate (`no-video-row`)
  - `metadata_status != 'ok'` → candidate (`metadata-incomplete`)
  - Metadata ok, no transcript row, `transcript_status` ∈ (null, pending,
    failed) → candidate (`transcript-retryable`)
  - Otherwise → skipped (`complete` or `missing-no-captions` terminal verdict)
- `hydrate=true` (default): runs the same Step-1 batch + Step-2 serial
  transcript path as `get_playlist_items` but ONLY for the candidate set.
  Quota cost: `ceil(N/50)` playlistItems.list + `ceil(M/50)` videos.list,
  where `M ≤ N` is the candidate count — savings vs. `get_playlist_items`
  scale with how much of the playlist was already cached.
- `hydrate=false`: returns the candidate list without issuing any
  videos.list calls.

### `get_transcript` — **cache-read-only**
Post-update, `get_transcript` is not part of the orchestrator fetch flow.
Orchestrator ETL jobs must use `get_video_details` / `get_playlist_items` with
their hydration flags on; `get_transcript` remains as a convenience
read-through endpoint but should not be called in a loop after metadata.

**Y3 update:** `get_transcript` is now strictly cache-read-only. It does NOT
fetch from InnerTube or make any outbound HTTP requests. It delegates
exclusively to `getTranscriptByVideoId` (the local SQLite cache) and returns
`{ videoId, transcript: string | null, status: "ok" | "missing" }`. To
populate the cache, use `get_video_details(includeTranscript=true)` or
`get_playlist_items(hydrate=true)`.

## Retry behavior

No retry logic is implemented in any tool. All operations are single-attempt;
the caller (orchestrating agent or user) is responsible for retrying on failure.

| Tool                       | Operation              | Retries | Backoff |
|----------------------------|------------------------|---------|---------|
| `get_video_details`        | videos.list (metadata) | none    | —       |
| `get_video_details`        | InnerTube transcript   | none    | —       |
| `get_playlist_items`       | playlistItems.list     | none    | —       |
| `get_playlist_items`       | videos.list (hydrate)  | none    | —       |
| `get_playlist_items`       | InnerTube transcript   | none    | —       |
| `get_new_playlist_items`   | playlistItems.list     | none    | —       |
| `get_new_playlist_items`   | videos.list (diff set) | none    | —       |
| `get_new_playlist_items`   | InnerTube transcript   | none    | —       |
| `get_transcript`           | cache read (SQLite)    | none    | —       |

## Status codes

Both consolidated tools emit per-item status blocks. Transcript status is one
of:

| Code          | Meaning                                                  |
|---------------|----------------------------------------------------------|
| `ok`          | `transcripts` row was upserted                           |
| `missing`     | Captions disabled / not available (404, "no captions")   |
| `unavailable` | API explicitly reported transcripts disabled             |
| `failed`      | Unexpected error; a short reason is included             |
| `skipped`     | Caller passed `includeTranscript=false`                  |

Metadata status is `ok` or `failed`. A `metadata: failed` always throws at the
tool boundary — it is never silently swallowed.

## Consumer-side every-call stderr capture (R1 mitigation)

Callers MUST tee the youtube-mcp server's stderr to a log file per request —
never fire-and-forget. v0.5.0 narrowed the transcript-error classifier so
that only `no captions` / `captions disabled` / `http 404` route to
`missing` and all other phrases land in `failed`; the free-text stderr line
emitted alongside `failed` is the caller's only signal to distinguish
"YouTube upstream hiccup, retry later" from "permanent classification
miss, inspect the fixture". Dropping stderr also blinds consumers to the
hydrate-loop's `fetchAndStoreVideo(..., {preFetchedDetails, source})`
quota-invariant logging — under the `HYDRATE_TRANSCRIPT_CONCURRENCY=1`
serial order, a missing stderr log is the first sign that the
`2*ceil(N/50)` quota budget is being violated.

The `data-etl-orchestrator`'s probe 4 enforces this invariant at
preflight: the 100 ms stderr deadline in assertion (d) only surfaces a
silent-DB-failure signal if the caller is actually reading stderr.
Direct callers bypassing the orchestrator must replicate the stderr-tee
discipline.

## Output shapes

`get_video_details` appends:

```
Statuses:
- metadata: ok | failed
- transcript: ok | missing | unavailable | failed | skipped
```

`get_playlist_items` (when `hydrate=true`) appends:

```
Hydration statuses (N items):
- <videoId>: metadata=ok transcript=ok
- <videoId>: metadata=ok transcript=missing
...
```

## Quota budget

### `get_transcript` — 0 quota units

`get_transcript` is **cache-read-only** (see [Cache-read-only note](#get_transcript--cache-read-only)
above). It makes zero outbound HTTP requests and consumes zero YouTube Data API
quota units.

### `get_video_details` and `get_playlist_items` — videos.list batching (Y1)

`get_playlist_items` (hydrate path) and `get_video_details` (single-video path)
both use `batchFetchVideoDetails` from `src/services/videoBatchFetcher.ts`.

Each `videos.list` call costs **1 quota unit** regardless of how many IDs are
passed (up to the API maximum of 50). Batching 50 IDs per call is therefore
always quota-optimal.

| Playlist size N | `videos.list` calls | Formula        |
|-----------------|---------------------|----------------|
| 1               | 1                   | ceil(1 / 50)   |
| 50              | 1                   | ceil(50 / 50)  |
| 51              | 2                   | ceil(51 / 50)  |
| 120             | 3                   | ceil(120 / 50) |
| 500 (max)       | 10                  | ceil(500 / 50) |

Transcript fetches (InnerTube) remain **1 network call per video** — they are
not batchable. Total quota cost for a playlist hydration of N videos:

- YouTube Data API v3: `ceil(N / 50)` quota units (videos.list)
- playlistItems.list paging: `ceil(N / 50)` quota units (independent of hydration)
- InnerTube transcript: 2 requests per video (player endpoint + caption XML), no quota deducted
- **Total Data API quota: `2 · ceil(N / 50)` units** (videos.list + playlistItems.list)

### `get_new_playlist_items` — incremental quota

`get_new_playlist_items` runs the same diff-then-hydrate flow but issues
`videos.list` only over the candidate subset M (where `M ≤ N` is the count of
playlist items that need ingestion per the diff predicate):

- playlistItems.list paging: `ceil(N / 50)` quota units (always paid — needed
  to discover the live playlist)
- YouTube Data API v3: `ceil(M / 50)` quota units (videos.list, only when
  `hydrate=true`)
- InnerTube transcript: 2 requests per candidate video, no quota deducted
- **Total Data API quota: `ceil(N / 50) + ceil(M / 50)` units when hydrating;
  `ceil(N / 50)` when `hydrate=false`.** When the cache is already fully
  populated (`M = 0`), the savings vs. `get_playlist_items` is exactly
  `ceil(N / 50)` videos.list units.

## Build

Run `npm run build` after any change. All TypeScript errors must be resolved
before reporting work complete.

## Testing

Run `npm test` to execute the test suite via Node.js built-in `node:test`.
Tests are compiled to `dist/tests/` as part of `npm run build`.
No third-party test framework is required.
