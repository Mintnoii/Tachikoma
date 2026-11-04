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
 * 纯函数：判断当前时间点是否已达到计划时刻（支持 HH:MM 格式计划点与跨午夜时间判定）
 *
 * 逻辑：
 * 1. 若未配置 times 或 times 为空，视为时刻门控未开启，始终返回 true；
 * 2. 过滤并解析合法 HH:MM 格式（小时 0-23，分钟 0-59）；
 * 3. 获取距离 now 最近的已过去的计划时刻（支持跨午夜，如 00:30 时最近计划时刻为昨晚 23:00）；
 * 4. 若未曾同步过 (lastSyncAt 为空或 <= 0)，返回 true；
 * 5. 若上次同步时间戳 lastSyncAt 小于该最近计划时刻，说明该时刻尚未同步，返回 true；反之返回 false。
 */
export function isScheduleTimeDue(
  now: Date,
  lastSyncAt: number | null | undefined,
  times?: string[]
): boolean {
  if (!times || times.length === 0) {
    return true;
  }

  const validTimes = sift(
    times.map((t) => {
      const match = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
      if (!match) return null;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
      return { hours, minutes };
    })
  );

  if (validTimes.length === 0) {
    return true;
  }

  const nowMs = now.getTime();
  if (Number.isNaN(nowMs)) {
    return true;
  }

  // 构造今日与昨日的所有计划时刻时间戳
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();

  const candidates = validTimes.flatMap(({ hours, minutes }) => {
    const todayCandidate = new Date(year, month, date, hours, minutes, 0, 0).getTime();
    const yesterdayCandidate = new Date(year, month, date - 1, hours, minutes, 0, 0).getTime();
    return [todayCandidate, yesterdayCandidate];
  });

  // 筛选出所有在当前时间及之前的计划点
  const pastCandidates = candidates.filter((ts) => ts <= nowMs);
  if (pastCandidates.length === 0) {
    return true;
  }

  // 最近已过去的计划时刻
  const mostRecentScheduleMs = Math.max(...pastCandidates);

  if (lastSyncAt === null || lastSyncAt === undefined || lastSyncAt <= 0) {
    return true;
  }

  const lastSyncMs = lastSyncAt < 1e11 ? lastSyncAt * 1000 : lastSyncAt;
  return lastSyncMs < mostRecentScheduleMs;
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

  const emptyConfig: SyncRulesConfig = {
    collections: [],
    nameKeywords: [],
    maxPerFolder: 0,
    batchSize: 0,
    authors: [],
    mixes: [],
    author_times: undefined,
    authorTimes: undefined,
    mix_times: undefined,
    mixTimes: undefined,
  };

  if (!existsSync(targetPath)) {
    return emptyConfig;
  }

  const [readErr, raw] = tryit(readFileSync)(targetPath, "utf-8");
  if (readErr || !raw) {
    console.warn(`[DouyinSync] 读取规则配置失败: ${targetPath}`, readErr);
    return emptyConfig;
  }

  const [parseErr, parsed] = tryit(parse)(raw) as [Error | undefined, Record<string, any>];
  if (parseErr || !parsed) {
    console.warn(`[DouyinSync] 解析规则配置 YAML 失败: ${targetPath}`, parseErr);
    return emptyConfig;
  }

  const authors: DouyinAuthorRule[] = Array.isArray(parsed?.authors)
    ? sift<DouyinAuthorRule>(
        parsed.authors.map((a: any) => {
          const secUid = a?.sec_uid ?? a?.secUid;
          if (!secUid) return null;
          const rawKeywords = a?.positioning_keywords ?? a?.positioningKeywords;
          const positioningKeywords = Array.isArray(rawKeywords)
            ? sift(rawKeywords.map((k: any) => String(k).trim()))
            : undefined;
          return {
            sec_uid: String(secUid).trim(),
            nickname: a.nickname ? String(a.nickname).trim() : undefined,
            max_count: Number(a.max_count ?? a.maxCount ?? 0) || undefined,
            batch_size: Number(a.batch_size ?? a.batchSize ?? 0) || undefined,
            positioning: a.positioning ? String(a.positioning).trim() : undefined,
            positioning_keywords: positioningKeywords,
            positioningKeywords: positioningKeywords,
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

  const authorTimes = Array.isArray(parsed?.author_times)
    ? sift(parsed.author_times.map((t: any) => String(t).trim()))
    : Array.isArray(parsed?.authorTimes)
      ? sift(parsed.authorTimes.map((t: any) => String(t).trim()))
      : undefined;

  const mixTimes = Array.isArray(parsed?.mix_times)
    ? sift(parsed.mix_times.map((t: any) => String(t).trim()))
    : Array.isArray(parsed?.mixTimes)
      ? sift(parsed.mixTimes.map((t: any) => String(t).trim()))
      : undefined;

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
    author_times: authorTimes,
    authorTimes,
    mix_times: mixTimes,
    mixTimes,
  };
}
