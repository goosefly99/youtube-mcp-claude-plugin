import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DEFAULT_DB_DIR = "W:\\youtube_mcp_db";
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, "youtube-data.db");

const rawDbPath = process.env.YOUTUBE_MCP_DB_PATH;
// Guard against unresolved ${…} template strings from plugin config
const DB_PATH =
  rawDbPath && !rawDbPath.includes("${") ? rawDbPath : DEFAULT_DB_PATH;
const IS_DEFAULT_PATH = DB_PATH === DEFAULT_DB_PATH;

let _db: DatabaseSync | null = null;

/**
 * Returns the singleton SQLite database instance, creating it on first call.
 * Backed by Node's built-in node:sqlite (no external native dependency).
 *
 * Defaults to W:\youtube_mcp_db\youtube-data.db; override with
 * YOUTUBE_MCP_DB_PATH. The database file must already exist — the server
 * will refuse to start if it cannot find one.
 */
export function getDb(): DatabaseSync {
  if (_db) return _db;

  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      `YouTube MCP database not found at: ${DB_PATH}\n` +
        `Set YOUTUBE_MCP_DB_PATH to the path of an existing database file.`,
    );
  }

  _db = new DatabaseSync(DB_PATH);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");

  return _db;
}

export function getDbPath(): string {
  return DB_PATH;
}

/**
 * Runs a function inside an immediate transaction. Mirrors better-sqlite3's
 * db.transaction() helper since node:sqlite has no built-in equivalent.
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
