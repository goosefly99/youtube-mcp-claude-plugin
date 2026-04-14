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

### `get_transcript` — **cache-read accessor only**
Post-update, `get_transcript` is not part of the orchestrator fetch flow.
Orchestrator ETL jobs must use `get_video_details` / `get_playlist_items` with
their hydration flags on; `get_transcript` remains as a convenience
read-through endpoint but should not be called in a loop after metadata.

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

## Build

Run `npm run build` after any change. All TypeScript errors must be resolved
before reporting work complete.
