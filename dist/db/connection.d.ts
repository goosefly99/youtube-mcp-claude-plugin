import { DatabaseSync } from "node:sqlite";
/**
 * Returns the singleton SQLite database instance, creating it on first call.
 * Backed by Node's built-in node:sqlite (no external native dependency).
 *
 * Defaults to W:\youtube_mcp_db\youtube-data.db; override with
 * YOUTUBE_MCP_DB_PATH. The database file must already exist — the server
 * will refuse to start if it cannot find one.
 */
export declare function getDb(): DatabaseSync;
export declare function getDbPath(): string;
/**
 * Runs a function inside an immediate transaction. Mirrors better-sqlite3's
 * db.transaction() helper since node:sqlite has no built-in equivalent.
 */
export declare function withTransaction<T>(db: DatabaseSync, fn: () => T): T;
