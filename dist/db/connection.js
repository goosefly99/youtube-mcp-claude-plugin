import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
const DEFAULT_DB_DIR = "W:\\youtube_mcp_db";
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, "youtube-data.db");
const DB_PATH = process.env.YOUTUBE_MCP_DB_PATH ?? DEFAULT_DB_PATH;
const IS_DEFAULT_PATH = DB_PATH === DEFAULT_DB_PATH;
let _db = null;
/**
 * Returns the singleton SQLite database instance, creating it on first call.
 * Backed by Node's built-in node:sqlite (no external native dependency).
 *
 * Defaults to W:\youtube_mcp_db\youtube-data.db; override with
 * YOUTUBE_MCP_DB_PATH. When using the default path, the parent directory
 * is auto-created.
 */
export function getDb() {
    if (_db)
        return _db;
    if (IS_DEFAULT_PATH) {
        fs.mkdirSync(DEFAULT_DB_DIR, { recursive: true });
    }
    _db = new DatabaseSync(DB_PATH);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
    return _db;
}
export function getDbPath() {
    return DB_PATH;
}
/**
 * Runs a function inside an immediate transaction. Mirrors better-sqlite3's
 * db.transaction() helper since node:sqlite has no built-in equivalent.
 */
export function withTransaction(db, fn) {
    db.exec("BEGIN");
    try {
        const result = fn();
        db.exec("COMMIT");
        return result;
    }
    catch (err) {
        db.exec("ROLLBACK");
        throw err;
    }
}
//# sourceMappingURL=connection.js.map