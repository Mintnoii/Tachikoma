import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "pathe";
import { tryit } from "radash";
import { toPosixPath } from "@dotagents/utils/path.ts";
import { DouyinAwemeItem } from "./types.js";

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS synced_awemes (
    aweme_id TEXT PRIMARY KEY,
    title TEXT,
    media_type TEXT,
    author_name TEXT,
    synced_at INTEGER,
    sha256 TEXT
  );

  CREATE TABLE IF NOT EXISTS sync_checkpoints (
    target_type TEXT,
    target_id TEXT,
    last_cursor INTEGER,
    last_synced_at INTEGER,
    PRIMARY KEY (target_type, target_id)
  );
`;

/**
 * 打开并初始化 SQLite 对账数据库连接
 */
export function openReconcilerDb(dbPath: string): DatabaseSync {
  const posixPath = toPosixPath(dbPath);
  tryit(mkdirSync)(dirname(posixPath), { recursive: true });
  const db = new DatabaseSync(posixPath);
  db.exec(INIT_SQL);
  return db;
}

/**
 * 检查作品是否已完成对账同步
 */
export function isSynced(db: DatabaseSync, awemeId: string): boolean {
  const stmt = db.prepare("SELECT aweme_id FROM synced_awemes WHERE aweme_id = ?");
  return Boolean(stmt.get(awemeId));
}

/**
 * 标记作品已同步并持久化对账元数据与 SHA256 指纹
 */
export function markSynced(
  db: DatabaseSync,
  awemeId: string,
  title: string,
  mediaType: string,
  authorName: string,
  sha256: string
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO synced_awemes (
      aweme_id, title, media_type, author_name, synced_at, sha256
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(awemeId, title, mediaType, authorName, Date.now(), sha256);
}

/**
 * 纯函数：根据对账库过滤未同步的作品列表
 */
export function filterUnsynced(
  db: DatabaseSync,
  items: readonly DouyinAwemeItem[]
): DouyinAwemeItem[] {
  return items.filter((item) => !isSynced(db, item.id));
}

/**
 * 读取增量游标断点检查点
 */
export function getCheckpoint(
  db: DatabaseSync,
  targetType: string,
  targetId: string
): { lastCursor: number; lastSyncedAt: number } | null {
  const stmt = db.prepare(
    "SELECT last_cursor, last_synced_at FROM sync_checkpoints WHERE target_type = ? AND target_id = ?"
  );
  const row = stmt.get(targetType, targetId) as
    | { last_cursor: number; last_synced_at: number }
    | undefined;
  return row ? { lastCursor: row.last_cursor, lastSyncedAt: row.last_synced_at } : null;
}

/**
 * 更新增量游标断点检查点
 */
export function setCheckpoint(
  db: DatabaseSync,
  targetType: string,
  targetId: string,
  cursor: number
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sync_checkpoints (
      target_type, target_id, last_cursor, last_synced_at
    ) VALUES (?, ?, ?, ?)
  `);
  stmt.run(targetType, targetId, cursor, Date.now());
}

/**
 * 关闭对账数据库连接
 */
export function closeReconcilerDb(db: DatabaseSync): void {
  db.close();
}
