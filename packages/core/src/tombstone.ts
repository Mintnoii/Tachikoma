import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "pathe";
import { sift, tryit } from "radash";
import { toPosixPath } from "./utils/path.js";
import { safeJsonParse } from "./utils/json.js";

export interface TombstoneRecord {
  readonly identifier: string;
  readonly sha256?: string;
  readonly sourceUrl?: string;
  readonly awemeId?: string;
  readonly title: string;
  readonly entry: string;
  readonly reason: string;
  readonly ignoredAt: string;
}

export interface TombstoneSet {
  readonly urls: ReadonlySet<string>;
  readonly ids: ReadonlySet<string>;
  readonly titles: ReadonlySet<string>;
}

export function cleanUrl(rawUrl?: string): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;
  const [urlErr, parsed] = tryit((str: string) => new URL(str))(trimmed);
  if (!urlErr && parsed) {
    return `${parsed.origin}${parsed.pathname}`;
  }
  return trimmed;
}

/**
 * 智能解析 Ghost 仓库根目录：无论是传入 Ghost 根目录、Ghost/_raw 还是其深层子目录，
 * 均能自动回溯并锚定至 Ghost 仓库根路径
 */
export function resolveGhostVaultRoot(rawPath: string): string {
  if (!rawPath) return "";
  const normalized = toPosixPath(rawPath).replace(/\/+$/, "");

  // 1. 若路径中包含 _raw，则其父目录必定为仓库根
  const rawIdx = normalized.indexOf("/_raw");
  if (rawIdx !== -1) {
    return normalized.slice(0, rawIdx) || "/";
  }
  if (normalized === "_raw" || normalized.startsWith("_raw/")) {
    return ".";
  }

  // 2. 原生祖先路径探测：直接寻找首个挂载 .cache/ignored.json 的父级
  const ancestors = normalized
    .split("/")
    .map((_, idx, arr) => arr.slice(0, arr.length - idx).join("/") || "/")
    .filter((p, i, a) => a.indexOf(p) === i);

  return (
    ancestors.find((p) => existsSync(join(p, ".cache/ignored.json"))) ??
    normalized
  );
}

/**
 * 从 Ghost 知识库加载墓碑账本索引
 */
export function loadGhostTombstones(ghostVaultRoot: string): TombstoneSet {
  const resolvedRoot = resolveGhostVaultRoot(ghostVaultRoot);
  const filePath = join(resolvedRoot, ".cache", "ignored.json");
  if (!existsSync(filePath)) {
    return { urls: new Set(), ids: new Set(), titles: new Set() };
  }

  const [err, content] = tryit((p: string) => readFileSync(p, "utf-8"))(filePath);
  if (err || !content) {
    return { urls: new Set(), ids: new Set(), titles: new Set() };
  }

  const records = safeJsonParse<TombstoneRecord[]>(String(content), []);
  if (records.length === 0) {
    return { urls: new Set(), ids: new Set(), titles: new Set() };
  }

  const urls = new Set<string>(
    sift(
      records.flatMap((r) => [
        r.sourceUrl?.trim(),
        cleanUrl(r.sourceUrl),
      ])
    )
  );

  const ids = new Set<string>(
    sift(
      records.flatMap((r) => [
        r.awemeId ? String(r.awemeId).trim() : null,
        r.identifier ? String(r.identifier).trim() : null,
      ])
    )
  );

  const titles = new Set<string>(
    sift(records.map((r) => (r.title ? r.title.trim().toLowerCase() : null)))
  );

  return { urls, ids, titles };
}

/**
 * 校验指定条目是否属于已被忽略的墓碑素材
 */
export function isTombstoneIgnored(
  query: { url?: string; awemeId?: string; title?: string },
  tombstones: TombstoneSet
): boolean {
  if (query.url) {
    const trimmed = query.url.trim();
    if (tombstones.urls.has(trimmed)) return true;
    const cleaned = cleanUrl(trimmed);
    if (cleaned && tombstones.urls.has(cleaned)) return true;
  }
  if (query.awemeId && tombstones.ids.has(String(query.awemeId).trim())) {
    return true;
  }
  if (query.title && tombstones.titles.has(query.title.trim().toLowerCase())) {
    return true;
  }
  return false;
}
