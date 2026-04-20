---
version: v0.5.0
---

# Transcript retry semantics

This document defines the per-status retry rules and caller responsibilities
for the `youtube-mcp` transcript pipeline. It is the authoritative reference
for orchestrator skills and other callers consuming transcript-status values.

## 1. Per-status retry rules

| Status          | Retry? |
| --------------- | --- |
| `ok`            | No — permanent success. |
| `missing`       | No — transcript is genuinely absent (source-side). |
| `unavailable`   | Yes — caller MAY retry after backoff. |
| `failed`        | Yes — caller MAY retry after backoff. |
| `skipped`       | N/A — caller requested skip. |

`ok`, `missing`, and `failed` are the only values ever persisted to the
`videos.transcript_status` DB column. `unavailable` and `skipped` are tool-
layer states mapped to DB values before upsert (see `toDbTranscriptStatus`
in `src/types/status.ts`).

## 2. Caller retry policy

Retry policy is entirely the caller's responsibility. `youtube-mcp` does NOT
enforce any retry or backoff logic, does NOT bundle a retry library, and does
NOT re-invoke failed operations on the caller's behalf.

Recommended baseline (not enforced):

- Strategy: exponential backoff with full jitter.
- Max attempts: ~3.
- Base delay: start small (e.g. 1–2s) to avoid compounding transient
  upstream (YouTube Data API / InnerTube) rate pressure across serial
  hydrate passes.

Callers SHOULD honor HTTP 429 (rate-limit) responses by extending their
backoff window. `youtube-mcp` surfaces rate-limit errors verbatim in the
transcript-reason reason string so caller policy can inspect and react.

## 3. Stability guarantees

- `missing` is a **terminal verdict**: the source lacks captions. It is
  wasteful to re-invoke `get_transcript` on a `missing` row — the call will
  return the same result indefinitely until the uploader changes caption
  settings.
- `failed` is a **transient verdict**: the call MAY succeed on retry.
  Callers are free to retry at their own cadence.
- `ok` is **permanent**: once stored, transcript rows are not re-fetched
  by any tool in this plugin.
- Status values never silently change meaning between point releases. Any
  change to the taxonomy is a breaking change under semver.

## 4. DB mapping (`toDbTranscriptStatus`)

The function `toDbTranscriptStatus` in `src/types/status.ts` collapses
tool-layer statuses to the DB column's smaller vocabulary:

- `unavailable` → `failed` (persisted as retryable; captions may exist but
  access was blocked at fetch time)
- `skipped` → `pending` (persisted so a later tool call can complete the
  transcript without re-fetching metadata)
- `ok` → `ok` (pass-through)
- `missing` → `missing` (pass-through; terminal)
- `failed` → `failed` (pass-through)

Callers reading the DB should treat `pending` and `failed` as eligible for
re-fetch; `ok` and `missing` as not. See Section 1 for the caller-facing
retry table.
