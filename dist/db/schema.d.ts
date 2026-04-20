import type { DatabaseSync } from "node:sqlite";
/**
 * Creates all database tables if they don't already exist.
 * Safe to call on every startup — all statements use IF NOT EXISTS.
 * Additive column migrations use PRAGMA table_info to stay idempotent.
 */
export declare function initSchema(db: DatabaseSync): void;
