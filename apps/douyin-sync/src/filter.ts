import { readFileSync, existsSync } from "node:fs";
import { resolve } from "pathe";
import { parse } from "yaml";
import { sift, tryit } from "radash";
import { getTachikomaWorkspacePaths } from "@tachikoma/core";
import {
  DouyinCollectionFolder,
  DouyinAuthorRule,
  DouyinMixRule,
  SyncRulesConfig,
  CollectFilterRules,
} from "./types.js";

export type { CollectFilterRules, SyncRulesConfig };

/**
 * 纯函数：根据精确名称与关键字包含规则筛选收藏夹，并按 id 去重
 */
export function filterCollectFolders(
  folders: readonly DouyinCollectionFolder[],
  rules: CollectFilterRules
): DouyinCollectionFolder[] {
  const exactNames = new Set(
    (rules.collections ?? []).map((s) => String(s).trim()).filter(Boolean)
  );
  // 过滤空关键字：strip 后为空的关键字若不过滤会导致 "" in name 恒真全命中
  const rawKeywords = (rules.nameKeywords ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean);

  if (exactNames.size === 0 && rawKeywords.length === 0) {
    return [];
  }

  const matched: DouyinCollectionFolder[] = [];
  const matchedIds = new Set<string>();

  for (const folder of folders) {
    const name = String(folder.name || "").trim();
    const isExact = exactNames.has(name);
    const isKeyword = rawKeywords.some((kw) => name.includes(kw));

    if ((isExact || isKeyword) && !matchedIds.has(folder.id)) {
      matchedIds.add(folder.id);
      matched.push(folder);
    }
  }

  return matched;
}

/**
 * 定位并读取同步规则配置（sync_rules.yaml）
 */
export function loadSyncRulesConfig(customConfigPath?: string): SyncRulesConfig {
  let targetPath = customConfigPath;
  if (!targetPath) {
    const rootDir = getTachikomaWorkspacePaths().rootDir;
    targetPath = resolve(rootDir, "apps/douyin-sync/config/sync_rules.yaml");
  }

  if (!existsSync(targetPath)) {
    return {
      collections: [],
      nameKeywords: [],
      maxPerFolder: 0,
      batchSize: 0,
      authors: [],
      mixes: [],
    };
  }

  const [readErr, raw] = tryit(readFileSync)(targetPath, "utf-8");
  if (readErr || !raw) {
    console.warn(`[DouyinSync] 读取规则配置失败: ${targetPath}`, readErr);
    return {
      collections: [],
      nameKeywords: [],
      maxPerFolder: 0,
      batchSize: 0,
      authors: [],
      mixes: [],
    };
  }

  const [parseErr, parsed] = tryit(parse)(raw) as [Error | undefined, Record<string, any>];
  if (parseErr || !parsed) {
    console.warn(`[DouyinSync] 解析规则配置 YAML 失败: ${targetPath}`, parseErr);
    return {
      collections: [],
      nameKeywords: [],
      maxPerFolder: 0,
      batchSize: 0,
      authors: [],
      mixes: [],
    };
  }

  const authors: DouyinAuthorRule[] = Array.isArray(parsed?.authors)
    ? sift<DouyinAuthorRule>(
        parsed.authors.map((a: any) => {
          const secUid = a?.sec_uid ?? a?.secUid;
          if (!secUid) return null;
          return {
            sec_uid: String(secUid).trim(),
            nickname: a.nickname ? String(a.nickname).trim() : undefined,
            max_count: Number(a.max_count ?? a.maxCount ?? 0) || undefined,
            batch_size: Number(a.batch_size ?? a.batchSize ?? 0) || undefined,
          };
        })
      )
    : [];

  const mixes: DouyinMixRule[] = Array.isArray(parsed?.mixes)
    ? sift<DouyinMixRule>(
        parsed.mixes.map((m: any) => {
          const mixId = m?.mix_id ?? m?.mixId;
          if (!mixId) return null;
          return {
            mix_id: String(mixId).trim(),
            name: m.name ? String(m.name).trim() : undefined,
            max_count: Number(m.max_count ?? m.maxCount ?? 0) || undefined,
            batch_size: Number(m.batch_size ?? m.batchSize ?? 0) || undefined,
          };
        })
      )
    : [];

  return {
    collections: Array.isArray(parsed?.collections) ? parsed.collections : [],
    nameKeywords: Array.isArray(parsed?.name_keywords)
      ? parsed.name_keywords
      : Array.isArray(parsed?.nameKeywords)
        ? parsed.nameKeywords
        : [],
    maxPerFolder: Number(parsed?.max_per_folder ?? parsed?.maxPerFolder ?? 0),
    batchSize: Number(parsed?.batch_size ?? parsed?.batchSize ?? 0),
    authors,
    mixes,
  };
}
