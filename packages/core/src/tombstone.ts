import { existsSync, readFileSync } from "node:fs";
import { join } from "pathe";
import { tryit } from "radash";

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
  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return trimmed;
  }
}

/**
 * 从 Ghost 知识库加载墓碑账本索引
 */
export function loadGhostTombstones(ghostVaultRoot: string): TombstoneSet {
  const filePath = join(ghostVaultRoot, ".cache", "ignored.json");
  if (!existsSync(filePath)) {
    return { urls: new Set(), ids: new Set(), titles: new Set() };
  }

  const [err, content] = tryit(readFileSync)(filePath, "utf-8");
  if (err || !content) {
    return { urls: new Set(), ids: new Set(), titles: new Set() };
  }

  const [parseErr, records] = tryit(JSON.parse)(content);
  if (parseErr || !Array.isArray(records)) {
    return { urls: new Set(), ids: new Set(), titles: new Set() };
  }

  const urls = new Set<string>();
  const ids = new Set<string>();
  const titles = new Set<string>();

  for (const r of records as TombstoneRecord[]) {
    if (r.sourceUrl) {
      urls.add(r.sourceUrl.trim());
      const cleaned = cleanUrl(r.sourceUrl);
      if (cleaned) urls.add(cleaned);
    }
    if (r.awemeId) ids.add(String(r.awemeId).trim());
    if (r.identifier) ids.add(String(r.identifier).trim());
    if (r.title) titles.add(r.title.trim().toLowerCase());
  }

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
