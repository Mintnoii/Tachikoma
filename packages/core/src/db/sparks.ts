import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, normalize } from "pathe";
import { tryit, unique, group, sift } from "radash";
import {
  SparkRecord,
  SparkType,
  SparkStatus,
  CreateSparkInput,
  UpdateSparkInput,
  validateSparkRecord,
} from "../schema.js";

/**
 * SQLite 底层 Sparks 记录行接口
 */
export interface SparkRow {
  id: string;
  type: string;
  status: string;
  title: string;
  content: string;
  source_url: string | null;
  asset_path: string | null;
  tags: string;
  cluster: string | null;
  access_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Sparks 多维查询过滤条件
 */
export interface SparksQueryFilter {
  type?: SparkType;
  status?: SparkStatus;
  tag?: string;
  cluster?: string | null;
  sortBy?: "created_at" | "updated_at" | "access_count";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/**
 * 全文检索选项
 */
export interface FtsSearchOptions {
  limit?: number;
  status?: SparkStatus;
  type?: SparkType;
}

/**
 * 标签聚合摘要
 */
export interface TagSummary {
  tag: string;
  count: number;
}

/**
 * 微领域簇聚合摘要
 */
export interface ClusterSummary {
  cluster: string;
  count: number;
}

/**
 * 涌现微主题簇建议
 */
export interface EmergingCluster {
  tag: string;
  count: number;
  sparkIds: string[];
}

/**
 * SQLite 表结构与 FTS5 虚拟表迁移 SQL
 */
export const INIT_SPARKS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS sparks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'seed',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source_url TEXT,
    asset_path TEXT,
    tags TEXT NOT NULL,
    cluster TEXT,
    access_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS sparks_fts USING fts5(
    id UNINDEXED,
    title,
    content,
    tags,
    tokenize='unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS sparks_ai AFTER INSERT ON sparks BEGIN
    INSERT INTO sparks_fts(id, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS sparks_ad AFTER DELETE ON sparks BEGIN
    DELETE FROM sparks_fts WHERE id = old.id;
  END;

  CREATE TRIGGER IF NOT EXISTS sparks_au AFTER UPDATE ON sparks BEGIN
    DELETE FROM sparks_fts WHERE id = old.id;
    INSERT INTO sparks_fts(id, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
  END;
`;

/**
 * 纯函数：将 SQLite 原始数据行转换为强契约 SparkRecord
 */
export function rowToSparkRecord(row: SparkRow): SparkRecord {
  const [parseErr, parsedTags] = tryit((raw: string) => JSON.parse(raw) as string[])(
    row.tags
  ) as [Error | undefined, string[] | undefined];
  const tags: string[] = !parseErr && Array.isArray(parsedTags) ? parsedTags : [];

  return {
    id: row.id,
    type: row.type as SparkType,
    status: row.status as SparkStatus,
    title: row.title,
    content: row.content,
    sourceUrl: row.source_url ?? undefined,
    assetPath: row.asset_path ?? undefined,
    tags,
    cluster: row.cluster ?? undefined,
    accessCount: Number(row.access_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 打开并初始化 Sparks 战术军械库数据库连接
 */
export function openSparksDb(dbPath: string = ":memory:"): DatabaseSync {
  let db: DatabaseSync;
  if (dbPath === ":memory:") {
    db = new DatabaseSync(":memory:");
  } else {
    const normalizedPath = normalize(dbPath);
    tryit(mkdirSync)(dirname(normalizedPath), { recursive: true });
    db = new DatabaseSync(normalizedPath);
  }

  db.exec(INIT_SPARKS_SCHEMA_SQL);
  return db;
}

/**
 * 安全关闭数据库连接
 */
export function closeSparksDb(db: DatabaseSync): void {
  tryit(() => db.close())();
}

/**
 * 创建并持久化战术灵感记录 (Create)
 */
export function createSpark(db: DatabaseSync, input: CreateSparkInput): SparkRecord {
  const now = new Date().toISOString();
  const rawTags = input.tags ?? [];
  const normalizedTags = unique(sift(rawTags.map((t) => (typeof t === "string" ? t.trim() : ""))));

  const record: SparkRecord = {
    id: input.id ?? randomUUID(),
    type: input.type,
    status: input.status ?? "seed",
    title: input.title.trim(),
    content: input.content,
    sourceUrl: input.sourceUrl?.trim() || undefined,
    assetPath: input.assetPath?.trim() || undefined,
    tags: normalizedTags,
    cluster: input.cluster?.trim() || undefined,
    accessCount: input.accessCount ?? 0,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now,
  };

  validateSparkRecord(record);

  const stmt = db.prepare(`
    INSERT INTO sparks (
      id, type, status, title, content, source_url, asset_path, tags, cluster, access_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    record.id,
    record.type,
    record.status,
    record.title,
    record.content,
    record.sourceUrl ?? null,
    record.assetPath ?? null,
    JSON.stringify(record.tags),
    record.cluster ?? null,
    record.accessCount,
    record.createdAt,
    record.updatedAt
  );

  return record;
}

/**
 * 根据 ID 查询单条战术灵感 (Read)
 */
export function getSparkById(db: DatabaseSync, id: string): SparkRecord | null {
  const stmt = db.prepare("SELECT * FROM sparks WHERE id = ?");
  const row = stmt.get(id) as SparkRow | undefined;
  return row ? rowToSparkRecord(row) : null;
}

/**
 * 更新指定战术灵感记录 (Update)
 */
export function updateSpark(
  db: DatabaseSync,
  id: string,
  updates: UpdateSparkInput
): SparkRecord | null {
  const current = getSparkById(db, id);
  if (!current) {
    return null;
  }

  const rawTags = updates.tags !== undefined ? updates.tags : current.tags;
  const normalizedTags = unique(sift(rawTags.map((t) => (typeof t === "string" ? t.trim() : ""))));

  const updatedRecord: SparkRecord = {
    id: current.id,
    type: updates.type ?? current.type,
    status: updates.status ?? current.status,
    title: updates.title !== undefined ? updates.title.trim() : current.title,
    content: updates.content !== undefined ? updates.content : current.content,
    sourceUrl: updates.sourceUrl !== undefined ? updates.sourceUrl?.trim() || undefined : current.sourceUrl,
    assetPath: updates.assetPath !== undefined ? updates.assetPath?.trim() || undefined : current.assetPath,
    tags: normalizedTags,
    cluster: updates.cluster !== undefined ? updates.cluster?.trim() || undefined : current.cluster,
    accessCount: updates.accessCount !== undefined ? updates.accessCount : current.accessCount,
    createdAt: current.createdAt,
    updatedAt: updates.updatedAt ?? new Date().toISOString(),
  };

  validateSparkRecord(updatedRecord);

  const stmt = db.prepare(`
    UPDATE sparks SET
      type = ?,
      status = ?,
      title = ?,
      content = ?,
      source_url = ?,
      asset_path = ?,
      tags = ?,
      cluster = ?,
      access_count = ?,
      updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updatedRecord.type,
    updatedRecord.status,
    updatedRecord.title,
    updatedRecord.content,
    updatedRecord.sourceUrl ?? null,
    updatedRecord.assetPath ?? null,
    JSON.stringify(updatedRecord.tags),
    updatedRecord.cluster ?? null,
    updatedRecord.accessCount,
    updatedRecord.updatedAt,
    id
  );

  return updatedRecord;
}

/**
 * 删除指定战术灵感 (Delete)
 */
export function deleteSpark(db: DatabaseSync, id: string): boolean {
  const stmt = db.prepare("DELETE FROM sparks WHERE id = ?");
  const result = stmt.run(id);
  return Number(result.changes) > 0;
}

/**
 * 递增调用/访问频次
 */
export function incrementSparkAccess(db: DatabaseSync, id: string): SparkRecord | null {
  const stmt = db.prepare(`
    UPDATE sparks
    SET access_count = access_count + 1, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(new Date().toISOString(), id);
  return getSparkById(db, id);
}

/**
 * 多维组合查询战术灵感列表
 */
export function querySparks(db: DatabaseSync, filter?: SparksQueryFilter): SparkRecord[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter?.type) {
    conditions.push("type = ?");
    params.push(filter.type);
  }

  if (filter?.status) {
    conditions.push("status = ?");
    params.push(filter.status);
  }

  if (filter?.cluster !== undefined) {
    if (filter.cluster === null) {
      conditions.push("(cluster IS NULL OR cluster = '')");
    } else {
      conditions.push("cluster = ?");
      params.push(filter.cluster);
    }
  }

  if (filter?.tag) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(sparks.tags) WHERE json_each.value = ?)");
    params.push(filter.tag);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const allowedSortColumns: Record<string, string> = {
    created_at: "created_at",
    updated_at: "updated_at",
    access_count: "access_count",
  };
  const sortColumn = allowedSortColumns[filter?.sortBy ?? "created_at"] ?? "created_at";
  const sortOrder = (filter?.sortOrder ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  let sql = `SELECT * FROM sparks ${whereClause} ORDER BY ${sortColumn} ${sortOrder}`;

  if (filter?.limit !== undefined && filter.limit > 0) {
    sql += " LIMIT ?";
    params.push(filter.limit);
  }

  if (filter?.offset !== undefined && filter.offset > 0) {
    sql += " OFFSET ?";
    params.push(filter.offset);
  }

  const stmt = db.prepare(sql);
  const rows = stmt.all(...(params as any[])) as unknown as SparkRow[];
  return rows.map(rowToSparkRecord);
}

/**
 * 全文检索 (FTS5 BM25 排序 + CJK 子串平滑融合，具备容错自动降级)
 */
export function ftsSearch(
  db: DatabaseSync,
  rawQuery: string,
  options?: FtsSearchOptions
): SparkRecord[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return [];
  }

  const conditions: string[] = [];
  const extraParams: (string | number | null)[] = [];

  if (options?.status) {
    conditions.push("s.status = ?");
    extraParams.push(options.status);
  }

  if (options?.type) {
    conditions.push("s.type = ?");
    extraParams.push(options.type);
  }

  const extraWhere = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  // 1. 尝试执行 FTS5 原生 MATCH（BM25 相关性优先）
  const [ftsErr, ftsRows] = tryit(() => {
    const ftsSql = `
      SELECT s.* FROM sparks s
      JOIN sparks_fts fts ON s.id = fts.id
      WHERE sparks_fts MATCH ? ${extraWhere}
      ORDER BY rank
    `;
    return db.prepare(ftsSql).all(trimmed, ...(extraParams as any[])) as unknown as SparkRow[];
  })();

  const validFtsRows = !ftsErr && ftsRows ? ftsRows : [];

  // 2. 结合 LIKE 检索进行中文字符/子串无缝补充（处理无分词 CJK 连续文本）
  const pattern = `%${trimmed}%`;
  const likeConditions: string[] = ["(s.title LIKE ? OR s.content LIKE ? OR s.tags LIKE ?)"];
  const likeParams: (string | number | null)[] = [pattern, pattern, pattern];

  if (options?.status) {
    likeConditions.push("s.status = ?");
    likeParams.push(options.status);
  }

  if (options?.type) {
    likeConditions.push("s.type = ?");
    likeParams.push(options.type);
  }

  const likeSql = `
    SELECT s.* FROM sparks s
    WHERE ${likeConditions.join(" AND ")}
    ORDER BY s.created_at DESC
  `;

  const [likeErr, likeRows] = tryit(() => {
    return db.prepare(likeSql).all(...(likeParams as any[])) as unknown as SparkRow[];
  })();

  const validLikeRows = !likeErr && likeRows ? likeRows : [];

  // 3. 结果合并去重：FTS5 高相关性记录优先，随后补充 LIKE 命中的记录
  const seenIds = new Set<string>();
  const mergedRows: SparkRow[] = [];

  for (const row of validFtsRows) {
    if (!seenIds.has(row.id)) {
      seenIds.add(row.id);
      mergedRows.push(row);
    }
  }

  for (const row of validLikeRows) {
    if (!seenIds.has(row.id)) {
      seenIds.add(row.id);
      mergedRows.push(row);
    }
  }

  // 4. 处理 limit
  const finalRows =
    options?.limit && options.limit > 0 ? mergedRows.slice(0, options.limit) : mergedRows;

  return finalRows.map(rowToSparkRecord);
}

/**
 * 全文检索兼容别名
 */
export const searchSparks = ftsSearch;

/**
 * 聚合统计所有标签频次 (高频优先)
 */
export function getTagsSummary(db: DatabaseSync): TagSummary[] {
  const stmt = db.prepare(`
    SELECT json_each.value AS tag, COUNT(*) AS count
    FROM sparks, json_each(sparks.tags)
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `);
  const rows = stmt.all() as Array<{ tag: string; count: number }>;
  return rows.map((r) => ({ tag: String(r.tag), count: Number(r.count) }));
}

/**
 * 聚合统计所有微领域簇 (高频优先)
 */
export function getClustersSummary(db: DatabaseSync): ClusterSummary[] {
  const stmt = db.prepare(`
    SELECT cluster, COUNT(*) AS count
    FROM sparks
    WHERE cluster IS NOT NULL AND cluster != ''
    GROUP BY cluster
    ORDER BY count DESC, cluster ASC
  `);
  const rows = stmt.all() as Array<{ cluster: string; count: number }>;
  return rows.map((r) => ({ cluster: String(r.cluster), count: Number(r.count) }));
}

/**
 * 按微领域主题簇对灵感集合进行分类归拢
 */
export function getSparksGroupedByCluster(db: DatabaseSync): Record<string, SparkRecord[]> {
  const allSparks = querySparks(db);
  return group(allSparks, (s) => s.cluster ?? "unclustered") as Record<string, SparkRecord[]>;
}

/**
 * 自动嗅探正在自然涌现的微主题簇 (当某标签聚合记录数达到指定阈值时)
 */
export function getEmergingClusters(
  db: DatabaseSync,
  threshold: number = 5
): EmergingCluster[] {
  const stmt = db.prepare(`
    SELECT json_each.value AS tag, COUNT(*) AS count
    FROM sparks, json_each(sparks.tags)
    GROUP BY tag
    HAVING count >= ?
    ORDER BY count DESC, tag ASC
  `);

  const tagRows = stmt.all(threshold) as Array<{ tag: string; count: number }>;
  if (tagRows.length === 0) {
    return [];
  }

  return tagRows.map((t) => {
    const sparksWithTag = querySparks(db, { tag: t.tag });
    return {
      tag: t.tag,
      count: Number(t.count),
      sparkIds: sparksWithTag.map((s) => s.id),
    };
  });
}
