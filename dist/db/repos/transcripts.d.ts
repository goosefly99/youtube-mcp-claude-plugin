import type { DatabaseSync } from "node:sqlite";
import type { Transcript } from "../../types.js";
import type { TranscriptRow } from "../types.js";
export interface QueryTranscriptsOpts {
    query?: string;
    language?: string;
    limit?: number;
    offset?: number;
}
export declare function upsertTranscript(db: DatabaseSync, transcript: Transcript): void;
/**
 * Query saved transcripts by full-text LIKE match and optional language.
 */
export declare function queryTranscripts(db: DatabaseSync, opts?: QueryTranscriptsOpts): TranscriptRow[];
export declare function getTranscriptByVideoId(db: DatabaseSync, videoId: string, language?: string): TranscriptRow | null;
