import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "pathe";
import { parse } from "yaml";
import { getTachikomaWorkspacePaths } from "@tachikoma/core";
import { DouyinCollectionFolder } from "./types.js";

export interface CollectFilterRules {
  collections?: string[];
  nameKeywords?: string[];
  maxPerFolder?: number;
}

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
export function loadSyncRulesConfig(customConfigPath?: string): CollectFilterRules {
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
    };
  }

  try {
    const raw = readFileSync(targetPath, "utf-8");
    const parsed = parse(raw) as Record<string, any>;
    return {
      collections: Array.isArray(parsed?.collections) ? parsed.collections : [],
      nameKeywords: Array.isArray(parsed?.name_keywords)
        ? parsed.name_keywords
        : Array.isArray(parsed?.nameKeywords)
          ? parsed.nameKeywords
          : [],
      maxPerFolder: Number(parsed?.max_per_folder ?? parsed?.maxPerFolder ?? 0),
    };
  } catch (err) {
    console.warn(`[DouyinSync] 读取规则配置失败: ${targetPath}`, err);
    return {
      collections: [],
      nameKeywords: [],
      maxPerFolder: 0,
    };
  }
}
