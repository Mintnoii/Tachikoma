import { mkdir, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "pathe";
import { sift, tryit } from "radash";
import { IngestionResult, persistIngestionResult, toPosixPath } from "@tachikoma/core";
import { openBrowserBridge, closeBrowserBridge, type BrowserBridge } from "./bridge.js";
import {
  fetchAllCollectFolders,
  fetchAllCollectAwemes,
  fetchAllAuthorAwemes,
  fetchAllMixAwemes,
} from "./client.js";
import { filterCollectFolders, loadSyncRulesConfig, isScheduleTimeDue } from "./filter.js";
import { fetchPublicAwemeItem } from "./public.js";
import { ocrGallery } from "./ocr.js";
import { createAudioTranscriber } from "./asr.js";
import {
  openReconcilerDb,
  closeReconcilerDb,
  markSynced,
  filterUnsynced,
  getCheckpoint,
  setCheckpoint,
  getLastSyncAt,
} from "./reconciliation.js";
import {
  DouyinAwemeItem,
  DouyinSyncOptions,
  DouyinAuthorRule,
  DouyinMixRule,
} from "./types.js";
import { DouyinExtractionError } from "./errors.js";
import { DOUYIN_CDN_HEADERS } from "./cdn.js";

/**
 * 下载媒体文件到沙盒/指定资产目录原子函数
 */
export async function downloadAsset(url: string, targetPath: string): Promise<string> {
  const posixPath = toPosixPath(targetPath);
  await tryit(mkdir)(dirname(posixPath), { recursive: true });

  const [fetchErr, res] = await tryit(fetch)(url, { headers: DOUYIN_CDN_HEADERS });
  if (fetchErr || !res?.ok) {
    const [bodyErr, body] = await tryit(async () => (await res?.text()) ?? "")();
    const hint = bodyErr || !body ? "" : ` body=${body.slice(0, 200)}`;
    throw new Error(`下载媒体资源失败 (${res?.status ?? fetchErr?.message}): ${url}${hint}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const [writeErr] = await tryit(writeFile)(posixPath, buffer);
  if (writeErr) {
    throw new Error(`保存媒体资源失败: ${posixPath} - ${writeErr.message}`);
  }
  return posixPath;
}

/**
 * 按序尝试多线路 CDN 地址，首个成功即止
 * @example
 * await downloadFirstAvailable(["https://a/1.mp4", "https://b/1.mp4"], "./v.mp4");
 */
export async function downloadFirstAvailable(
  urls: readonly string[],
  targetPath: string
): Promise<string> {
  const [first, ...rest] = urls;
  if (!first) throw new Error(`无可用的媒体下载地址: ${targetPath}`);

  const [err, savedPath] = await tryit(downloadAsset)(first, targetPath);
  if (!err && savedPath) return savedPath;
  if (rest.length === 0) throw err ?? new Error(`下载失败: ${first}`);
  return await downloadFirstAvailable(rest, targetPath);
}

/**
 * 处理单条抖音作品：音视频/图集管线全流程（纯函数式流式处理，杜绝命令式 for 循环与 push 状态机）
 */
export async function processAweme(
  item: DouyinAwemeItem,
  options: DouyinSyncOptions,
  db?: DatabaseSync,
  folderName?: string
): Promise<IngestionResult> {
  const title = (item.desc || `抖音作品_${item.id}`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  const assetBaseDir = join(
    options.outputDir,
    "assets",
    "douyin",
    item.id
  );

  const isGallery = item.mediaType === "gallery";

  // 1. 图集管线：下载图片（若开启）并调用 Magpie 视觉模型进行 OCR 转录
  const images = item.imageUrls ?? [];
  const downloadedImages =
    isGallery && options.downloadMedia && images.length > 0
      ? sift(
          await Promise.all(
            images.map(async (imgUrl, i) => {
              const imgFile = join(assetBaseDir, `image_${i + 1}.jpeg`);
              const [err, savedPath] = await tryit(downloadAsset)(imgUrl, imgFile);
              return err ? null : savedPath;
            })
          )
        )
      : [];

  // 2. 视频管线：可选持久化 mp4（多 CDN 线路按序尝试）
  const videoUrls = item.videoUrlList ?? (item.videoPlayUrl ? [item.videoPlayUrl] : []);
  const downloadedVideo =
    !isGallery && options.downloadMedia && videoUrls.length > 0
      ? await (async () => {
          const videoFile = join(assetBaseDir, `video_${item.id}.mp4`);
          const [err, savedPath] = await tryit(downloadFirstAvailable)(
            videoUrls,
            videoFile
          );
          return err || !savedPath ? [] : [savedPath];
        })()
      : [];

  const downloadedAssets = isGallery ? downloadedImages : downloadedVideo;

  // 正文生成：Zero-Dirty-Card 极简契约 —— 必须具备有效转录/OCR，严禁无脑降级落盘脏卡片
  const contentBody = isGallery
    ? await (async () => {
        const ocrSources = downloadedAssets.length > 0 ? downloadedAssets : images;
        if (ocrSources.length === 0) {
          throw new Error(`图集作品缺失图片资源，无法执行 OCR: awemeId=${item.id}`);
        }
        const [ocrErr, ocrMarkdown] = await tryit(async () => {
          if (options.customOcr) {
            return await options.customOcr(ocrSources);
          }
          return await ocrGallery(ocrSources, {
            baseUrl: options.magpieBaseUrl,
            apiKey: options.magpieApiKey,
            model: options.magpieModel,
            customFetcher: options.customFetcher,
          });
        })();

        if (ocrErr || !ocrMarkdown || !ocrMarkdown.trim()) {
          throw ocrErr ?? new Error(`图集 OCR 转录失败或结果为空: awemeId=${item.id}`);
        }

        return sift([
          `# ${title}`,
          "",
          `> 创作者: [${item.author.nickname}](https://www.douyin.com/user/${item.author.secUid})`,
          `> 发布时间: ${new Date(item.createTime * 1000).toISOString()}`,
          `> 原始链接: ${item.shareUrl}`,
          "",
          "## 图集作品 OCR 转录文字稿",
          "",
          ocrMarkdown.trim(),
        ]).join("\n");
      })()
    : await (async () => {
        const videoSource =
          downloadedAssets.length > 0
            ? downloadedAssets[0]
            : (item.videoPlayUrl || item.shareUrl);
        if (!videoSource) {
          throw new Error(`视频作品缺失有效播放地址或链接: awemeId=${item.id}`);
        }

        const transcriber = options.customTranscribe ?? createAudioTranscriber();
        const [transcribeErr, rawTranscript] = await tryit(transcriber)(videoSource);

        if (transcribeErr || !rawTranscript || !rawTranscript.trim()) {
          throw transcribeErr ?? new Error(`视频语音转录失败或结果为空: awemeId=${item.id}`);
        }

        const transcriptMarkdown = `> 🎙️ **[音频转录]**\n\n${rawTranscript.trim()}`;

        return sift([
          `# ${title}`,
          "",
          `> 创作者: [${item.author.nickname}](https://www.douyin.com/user/${item.author.secUid})`,
          `> 发布时间: ${new Date(item.createTime * 1000).toISOString()}`,
          `> 原始链接: ${item.shareUrl}`,
          "",
          "## 转录内容 / Notes",
          "",
          transcriptMarkdown,
        ]).join("\n");
      })();

  const ingestionResult: IngestionResult = {
    sourceUrl: item.shareUrl,
    mediaType: item.mediaType,
    title,
    author: {
      name: item.author.nickname,
      id: item.author.secUid,
      avatar: item.author.avatarUrl,
    },
    content: contentBody,
    rawAssets: downloadedAssets.length > 0 ? downloadedAssets : undefined,
    metadata: {
      awemeId: item.id,
      statistics: item.statistics,
      createTime: item.createTime,
    },
    createdAt: new Date(item.createTime * 1000).toISOString(),
  };

  const resolvedFolder = (folderName ?? options.folderName)?.trim();
  const sanitizedFolder = resolvedFolder
    ? resolvedFolder.replace(/[:*?"<>|]/g, "_")
    : undefined;
  const category = sanitizedFolder ? `douyin/${sanitizedFolder}` : "douyin";

  // 落盘至 outputDir/douyin/<folderName>/ 或 outputDir/douyin/
  const { sha256 } = await persistIngestionResult(
    ingestionResult,
    options.outputDir,
    category
  );

  ingestionResult.sha256 = sha256;

  // 对账标记已同步（仅全流程转录并落盘成功后写入对账库，严禁脏卡片对账）
  if (db) {
    markSynced(
      db,
      item.id,
      title,
      item.mediaType,
      item.author.nickname,
      sha256
    );
  }

  return ingestionResult;
}

/**
 * 协同执行作用域：统一接管 BrowserBridge 与 SQLite 对账数据库生命周期，消除裸写 try/finally
 */
async function withSyncResources<T>(
  options: Partial<DouyinSyncOptions>,
  fn: (bridge: BrowserBridge, db?: DatabaseSync) => Promise<T>
): Promise<T> {
  const dbPath = options.sqlitePath ?? options.dbPath;
  const db = dbPath ? openReconcilerDb(dbPath) : undefined;
  const bridge = openBrowserBridge({
    profileDir: options.profileDir,
    headless: true,
    customTransport: options.customTransport,
  });

  const [execErr, result] = await tryit(fn)(bridge, db);

  await tryit(closeBrowserBridge)(bridge);
  if (db) {
    tryit(closeReconcilerDb)(db);
  }

  if (execErr) {
    throw execErr;
  }
  return result!;
}

/**
 * 内部纯函数原子流：增量同步抖音收藏夹核心逻辑
 */
export async function syncCollectionsInternal(
  bridge: BrowserBridge,
  db: DatabaseSync | undefined,
  options: DouyinSyncOptions,
  collectId?: string
): Promise<IngestionResult[]> {
  const targetCollectId = collectId ?? options.collectId;

  // 1. 获取全量收藏夹列表（分页循环拉全，不截断）
  const allFolders = await fetchAllCollectFolders(bridge);

  let targetFolders: typeof allFolders = [];
  let maxPerFolder = 0;

  if (targetCollectId) {
    const found = allFolders.find((f) => f.id === targetCollectId);
    targetFolders = [
      found ?? {
        id: targetCollectId,
        name: options.folderName || "未命名收藏夹",
        totalCount: 0,
      },
    ];
  } else {
    // 2. 加载过滤规则（优先 options 传入，其次读 sync_rules.yaml）
    const fileRules = loadSyncRulesConfig(options.rulesConfigPath);
    const effectiveRules = {
      collections: options.filterRules?.collections ?? fileRules.collections,
      nameKeywords: options.filterRules?.nameKeywords ?? fileRules.nameKeywords,
      maxPerFolder: options.filterRules?.maxPerFolder ?? fileRules.maxPerFolder ?? 0,
    };
    maxPerFolder = effectiveRules.maxPerFolder;

    targetFolders = filterCollectFolders(allFolders, effectiveRules);

    if (targetFolders.length === 0) {
      const hasAnyRule =
        (effectiveRules.collections?.length ?? 0) > 0 ||
        (effectiveRules.nameKeywords?.length ?? 0) > 0;
      if (!hasAnyRule) {
        console.warn(
          "[DouyinSync] ⚠️  安全拦截：未指定同步收藏夹 ID，且未配置任何 collections/name_keywords 规则。已停止全量拉取以防污染知识库。"
        );
      } else {
        console.log(
          `[DouyinSync] 在账号的 ${allFolders.length} 个收藏夹中未匹配到符合规则的收藏夹，本次跳过。`
        );
      }
      return [];
    }

    console.log(
      `[DouyinSync] 规则命中 ${targetFolders.length}/${allFolders.length} 个收藏夹: ` +
        targetFolders.map((f) => `「${f.name}」(${f.totalCount}条)`).join("、")
    );
  }

  // 3. 逐个收藏夹同步作品（单夹支持全量分页拉全与增量断点检查点，严格串行处理与配额节流）
  const fileRules = loadSyncRulesConfig(options.rulesConfigPath);
  const folderResults: IngestionResult[][] = [];
  for (const folder of targetFolders) {
    const checkpoint = db ? getCheckpoint(db, "collect", folder.id) : null;
    const startCursor = checkpoint?.lastCursor ?? 0;

    const { items, nextCursor, hasMore } = await fetchAllCollectAwemes(
      bridge,
      folder.id,
      maxPerFolder,
      20,
      50,
      startCursor
    );
    const folderSubDir = folder.name || undefined;
    const unsyncedItems = db
      ? filterUnsynced(db, items, options.outputDir)
      : items;

    if (unsyncedItems.length > 0) {
      console.log(
        `[DouyinSync] 收藏夹「${folder.name}」共拉取 ${items.length} 件 (游标: ${startCursor} -> ${nextCursor})，需增量摄入 ${unsyncedItems.length} 件`
      );
    }

    const effectiveBatchSize =
      options.batchSize ?? options.filterRules?.batchSize ?? fileRules?.batchSize ?? 0;
    const itemsToProcess =
      effectiveBatchSize > 0 ? unsyncedItems.slice(0, effectiveBatchSize) : unsyncedItems;

    if (itemsToProcess.length < unsyncedItems.length) {
      console.log(
        `[DouyinSync] 收藏夹「${folder.name}」待摄入 ${unsyncedItems.length} 件，受 batchSize=${effectiveBatchSize} 配额限制，本次处理前 ${itemsToProcess.length} 件`
      );
    }

    const results: IngestionResult[] = [];
    for (const item of itemsToProcess) {
      const [err, res] = await tryit(processAweme)(item, options, db, folderSubDir);
      if (err || !res) {
        console.warn(
          `[DouyinSync] ⚠️ 作品「${item.desc || item.id}」(${item.id}) 转录/处理失败，已跳过落盘以保持知识库纯洁:`,
          err?.message
        );
        continue;
      }
      results.push(res);
    }
    folderResults.push(results);

    // 同步成功后持久化更新检查点：若本批次还有未消化的作品或存在处理失败项，游标保持在 startCursor，避免跨批次跳漏
    if (db) {
      const safeNextCursor =
        itemsToProcess.length < unsyncedItems.length || results.length < itemsToProcess.length
          ? startCursor
          : hasMore
            ? nextCursor
            : 0;
      setCheckpoint(db, "collect", folder.id, safeNextCursor);
    }
  }

  return folderResults.flat();
}

/**
 * 内部纯函数原子流：增量同步抖音作者主页核心逻辑
 */
export async function syncAuthorsInternal(
  bridge: BrowserBridge,
  db: DatabaseSync | undefined,
  options: DouyinSyncOptions,
  secUid?: string
): Promise<IngestionResult[]> {
  const targetSecUid = secUid ?? options.authorSecUid;
  const fileRules = loadSyncRulesConfig(options.rulesConfigPath);
  let targetAuthors: DouyinAuthorRule[] = [];

  if (targetSecUid) {
    targetAuthors = [
      {
        sec_uid: targetSecUid,
        nickname: options.authorNickname,
        max_count: options.maxCount,
        batch_size: options.batchSize,
      },
    ];
  } else {
    targetAuthors =
      options.authors ??
      options.filterRules?.authors ??
      fileRules.authors ??
      [];
  }

  if (targetAuthors.length === 0) {
    console.log("[DouyinSync] 未配置任何作者主页同步规则，本次跳过作者同步。");
    return [];
  }

  console.log(
    `[DouyinSync] 准备同步 ${targetAuthors.length} 位作者主页: ` +
      targetAuthors.map((a) => `「${a.nickname || a.sec_uid}」`).join("、")
  );

  const authorResults: IngestionResult[][] = [];
  for (const author of targetAuthors) {
    const checkpoint = db ? getCheckpoint(db, "author", author.sec_uid) : null;
    const startCursor = checkpoint?.lastCursor ?? 0;
    const maxCount = author.max_count ?? options.maxCount ?? 0;

    const { items, nextCursor, hasMore } = await fetchAllAuthorAwemes(
      bridge,
      author.sec_uid,
      maxCount,
      18,
      50,
      startCursor
    );

    const rawKeywords = author.positioning_keywords ?? author.positioningKeywords;
    const keywords = sift(
      (rawKeywords ?? []).map((k) => String(k).trim())
    );

    const matchedItems =
      keywords.length > 0
        ? items.filter((item) => {
            const desc = (item.desc || "").toLowerCase();
            return keywords.some((kw) => desc.includes(kw.toLowerCase()));
          })
        : items;

    if (keywords.length > 0) {
      console.log(
        `[DouyinSync] 作者「${author.nickname || author.sec_uid}」按定位关键词 [${keywords.join(", ")}] 过滤: ${matchedItems.length}/${items.length} 件命中`
      );
    }

    const subDir = `authors/${author.nickname || author.sec_uid}`;
    const unsyncedItems = db
      ? filterUnsynced(db, matchedItems, options.outputDir)
      : matchedItems;

    if (unsyncedItems.length > 0) {
      console.log(
        `[DouyinSync] 作者「${author.nickname || author.sec_uid}」共拉取 ${items.length} 件 (游标: ${startCursor} -> ${nextCursor})，需增量摄入 ${unsyncedItems.length} 件`
      );
    }

    const effectiveBatchSize =
      author.batch_size ??
      options.batchSize ??
      options.filterRules?.batchSize ??
      fileRules?.batchSize ??
      0;
    const itemsToProcess =
      effectiveBatchSize > 0 ? unsyncedItems.slice(0, effectiveBatchSize) : unsyncedItems;

    if (itemsToProcess.length < unsyncedItems.length) {
      console.log(
        `[DouyinSync] 作者「${author.nickname || author.sec_uid}」待摄入 ${unsyncedItems.length} 件，受 batchSize=${effectiveBatchSize} 配额限制，本次处理前 ${itemsToProcess.length} 件`
      );
    }

    const results: IngestionResult[] = [];
    for (const item of itemsToProcess) {
      const [err, res] = await tryit(processAweme)(item, options, db, subDir);
      if (err || !res) {
        console.warn(
          `[DouyinSync] ⚠️ 作者「${author.nickname || author.sec_uid}」作品「${item.desc || item.id}」(${item.id}) 转录/处理失败，已跳过落盘以保持知识库纯洁:`,
          err?.message
        );
        continue;
      }
      results.push(res);
    }
    authorResults.push(results);

    if (db) {
      const safeNextCursor =
        itemsToProcess.length < unsyncedItems.length || results.length < itemsToProcess.length
          ? startCursor
          : hasMore
            ? nextCursor
            : 0;
      setCheckpoint(db, "author", author.sec_uid, safeNextCursor);
    }
  }

  if (db) {
    setCheckpoint(db, "track", "author", 0);
  }

  return authorResults.flat();
}

/**
 * 内部纯函数原子流：增量同步抖音合集专栏核心逻辑
 */
export async function syncMixesInternal(
  bridge: BrowserBridge,
  db: DatabaseSync | undefined,
  options: DouyinSyncOptions,
  mixId?: string
): Promise<IngestionResult[]> {
  const targetMixId = mixId ?? options.mixId;
  const fileRules = loadSyncRulesConfig(options.rulesConfigPath);
  let targetMixes: DouyinMixRule[] = [];

  if (targetMixId) {
    const configuredMix = fileRules.mixes?.find((m) => m.mix_id === targetMixId);
    targetMixes = [
      {
        mix_id: targetMixId,
        name: options.mixName ?? configuredMix?.name,
        max_count: options.maxCount ?? configuredMix?.max_count,
        batch_size: options.batchSize ?? configuredMix?.batch_size,
      },
    ];
  } else {
    targetMixes =
      options.mixes ??
      options.filterRules?.mixes ??
      fileRules.mixes ??
      [];
  }

  if (targetMixes.length === 0) {
    console.log("[DouyinSync] 未配置任何合集专栏同步规则，本次跳过合集同步。");
    return [];
  }

  console.log(
    `[DouyinSync] 准备同步 ${targetMixes.length} 个合集专栏: ` +
      targetMixes.map((m) => `「${m.name || m.mix_id}」`).join("、")
  );

  const mixResults: IngestionResult[][] = [];
  for (const mix of targetMixes) {
    const checkpoint = db ? getCheckpoint(db, "mix", mix.mix_id) : null;
    const startCursor = checkpoint?.lastCursor ?? 0;
    const maxCount = mix.max_count ?? options.maxCount ?? 0;

    const { items, nextCursor, hasMore } = await fetchAllMixAwemes(
      bridge,
      mix.mix_id,
      maxCount,
      20,
      50,
      startCursor
    );

    const subDir = `mixes/${mix.name || mix.mix_id}`;
    const unsyncedItems = db
      ? filterUnsynced(db, items, options.outputDir)
      : items;

    if (unsyncedItems.length > 0) {
      console.log(
        `[DouyinSync] 合集「${mix.name || mix.mix_id}」共拉取 ${items.length} 件 (游标: ${startCursor} -> ${nextCursor})，需增量摄入 ${unsyncedItems.length} 件`
      );
    }

    const effectiveBatchSize =
      mix.batch_size ??
      options.batchSize ??
      options.filterRules?.batchSize ??
      fileRules?.batchSize ??
      0;
    const itemsToProcess =
      effectiveBatchSize > 0 ? unsyncedItems.slice(0, effectiveBatchSize) : unsyncedItems;

    if (itemsToProcess.length < unsyncedItems.length) {
      console.log(
        `[DouyinSync] 合集「${mix.name || mix.mix_id}」待摄入 ${unsyncedItems.length} 件，受 batchSize=${effectiveBatchSize} 配额限制，本次处理前 ${itemsToProcess.length} 件`
      );
    }

    const results: IngestionResult[] = [];
    for (const item of itemsToProcess) {
      const [err, res] = await tryit(processAweme)(item, options, db, subDir);
      if (err || !res) {
        console.warn(
          `[DouyinSync] ⚠️ 合集「${mix.name || mix.mix_id}」作品「${item.desc || item.id}」(${item.id}) 转录/处理失败，已跳过落盘以保持知识库纯洁:`,
          err?.message
        );
        continue;
      }
      results.push(res);
    }
    mixResults.push(results);

    if (db) {
      const safeNextCursor =
        itemsToProcess.length < unsyncedItems.length || results.length < itemsToProcess.length
          ? startCursor
          : hasMore
            ? nextCursor
            : 0;
      setCheckpoint(db, "mix", mix.mix_id, safeNextCursor);
    }
  }

  if (db) {
    setCheckpoint(db, "track", "mix", 0);
  }

  return mixResults.flat();
}

/**
 * 纯函数原子流：增量同步抖音收藏夹并自动对账
 *
 * 1. 若指定 collectId，则仅同步单个指定收藏夹；
 * 2. 若未指定，自动拉取全量收藏夹列表（支持分页循环拉全），并按 sync_rules.yaml（或 options.filterRules）
 *    执行 collections 精确匹配与 name_keywords 模糊包含过滤；
 * 3. 安全守卫：未指定单夹且过滤规则为空时，拒绝无脑全量同步；
 * 4. 夹内作品支持全量游标分页拉取（突破单次 10 条限制），并支持 maxPerFolder 上限控制。
 */
export async function syncCollections(
  options: DouyinSyncOptions,
  collectId?: string
): Promise<IngestionResult[]> {
  return await withSyncResources(options, async (bridge, db) => {
    return await syncCollectionsInternal(bridge, db, options, collectId);
  });
}

/**
 * 纯函数原子流：增量同步抖音作者主页并自动对账
 */
export async function syncAuthors(
  options: DouyinSyncOptions,
  secUid?: string
): Promise<IngestionResult[]> {
  return await withSyncResources(options, async (bridge, db) => {
    return await syncAuthorsInternal(bridge, db, options, secUid);
  });
}

/**
 * 纯函数原子流：增量同步抖音合集专栏并自动对账
 */
export async function syncMixes(
  options: DouyinSyncOptions,
  mixId?: string
): Promise<IngestionResult[]> {
  return await withSyncResources(options, async (bridge, db) => {
    return await syncMixesInternal(bridge, db, options, mixId);
  });
}

export interface DouyinSyncAllTargets {
  collectId?: string;
  authorSecUid?: string;
  mixId?: string;
  forceAll?: boolean;
}

export interface DouyinSyncAllResult {
  collections: IngestionResult[];
  authors: IngestionResult[];
  mixes: IngestionResult[];
  total: number;
}

/**
 * 纯函数原子流：统一门面同步抖音全量（收藏夹、创作者主页与合集专栏），复用同一会话资源
 */
export async function syncDouyinAll(
  options: DouyinSyncOptions,
  targets?: DouyinSyncAllTargets
): Promise<DouyinSyncAllResult> {
  return await withSyncResources(options, async (bridge, db) => {
    const hasSpecificTarget = Boolean(
      targets?.collectId || targets?.authorSecUid || targets?.mixId
    );
    const forceAll = Boolean(options.forceAll || targets?.forceAll);

    let collections: IngestionResult[] = [];
    let authors: IngestionResult[] = [];
    let mixes: IngestionResult[] = [];

    const fileRules = loadSyncRulesConfig(options.rulesConfigPath);
    const now = options.now ?? new Date();

    // 调度顺序策略：专栏权威优先制 (Mixes > Authors > Collections)
    // 确保体系化专栏合集与核心作者主页优先归位入库，个人收藏夹自动享受去重，彻底消灭跨目录重复存两份
    if (!hasSpecificTarget || targets?.mixId) {
      const isExplicitMix = Boolean(targets?.mixId);
      const mixTimes =
        options.mix_times ??
        options.mixTimes ??
        options.filterRules?.mix_times ??
        options.filterRules?.mixTimes ??
        fileRules.mix_times ??
        fileRules.mixTimes;
      const lastMixSync = db ? getLastSyncAt(db, "mix") : null;
      const isDue = isExplicitMix || forceAll || isScheduleTimeDue(now, lastMixSync, mixTimes);

      if (isDue) {
        mixes = await syncMixesInternal(bridge, db, options, targets?.mixId);
      } else {
        console.log(
          `[DouyinSync] ⏰ 合集专栏未到计划同步时刻 (配置: [${mixTimes?.join(", ")}]，上次同步: ${
            lastMixSync ? new Date(lastMixSync).toLocaleTimeString() : "从未"
          })，本次跳过。`
        );
      }
    }

    if (!hasSpecificTarget || targets?.authorSecUid) {
      const isExplicitAuthor = Boolean(targets?.authorSecUid);
      const authorTimes =
        options.author_times ??
        options.authorTimes ??
        options.filterRules?.author_times ??
        options.filterRules?.authorTimes ??
        fileRules.author_times ??
        fileRules.authorTimes;
      const lastAuthorSync = db ? getLastSyncAt(db, "author") : null;
      const isDue = isExplicitAuthor || forceAll || isScheduleTimeDue(now, lastAuthorSync, authorTimes);

      if (isDue) {
        authors = await syncAuthorsInternal(bridge, db, options, targets?.authorSecUid);
      } else {
        console.log(
          `[DouyinSync] ⏰ 创作者主页未到计划同步时刻 (配置: [${authorTimes?.join(", ")}]，上次同步: ${
            lastAuthorSync ? new Date(lastAuthorSync).toLocaleTimeString() : "从未"
          })，本次跳过。`
        );
      }
    }

    if (!hasSpecificTarget || targets?.collectId) {
      collections = await syncCollectionsInternal(bridge, db, options, targets?.collectId);
    }

    return {
      collections,
      authors,
      mixes,
      total: collections.length + authors.length + mixes.length,
    };
  });
}

export interface FetchAwemeResult {
  aweme: DouyinAwemeItem;
  transcript?: string;
  ocrContent?: string;
}

/**
 * 纯函数原子流：获取单条抖音作品详情与语音转录/OCR文本
 * 优先对单条公开作品执行免登录纯内存匿名解析，按需平滑降级回退
 */
export async function fetchAwemeDetailWithTranscript(
  urlOrId: string,
  options?: Partial<DouyinSyncOptions>
): Promise<FetchAwemeResult> {
  // 1. 优先尝试免登录纯内存匿名解析（若传入 profileDir 则配置登录态自动兜底）
  const [publicErr, publicAweme] = await tryit(fetchPublicAwemeItem)(urlOrId, {
    customExtractor: options?.customExtractor,
    customTransport: options?.customTransport,
    session: options?.profileDir ? { userDataDir: options.profileDir } : undefined,
  });

  // 提取统一由 fetchPublicAwemeItem 负责：匿名 → 登录态 → note 重试。
  // 失败原因与 attempts 原样上报，不再另起浏览器用同源桥接重复提取同一作品。
  if (publicErr || !publicAweme || (!publicAweme.id && !publicAweme.desc)) {
    throw publicErr ?? new DouyinExtractionError("ssr-no-item", `抖音作品提取结果为空: ${urlOrId}`);
  }
  const aweme = publicAweme;

  const transcript =
    aweme.mediaType === "video"
      ? await (async () => {
          const transcriber = options?.customTranscribe ?? createAudioTranscriber();
          const videoSource = aweme.videoPlayUrl || aweme.shareUrl;
          if (!videoSource) return undefined;
          const [transcribeErr, res] = await tryit(transcriber)(videoSource);
          return !transcribeErr && res && res.trim() ? res.trim() : undefined;
        })()
      : undefined;

  const imageUrls = aweme.imageUrls;
  const ocrContent =
    aweme.mediaType === "gallery" && imageUrls && imageUrls.length > 0
      ? await (async () => {
          const ocrFn =
            options?.customOcr ??
            ((imgs: string[]) =>
              ocrGallery(imgs, {
                baseUrl: options?.magpieBaseUrl,
                apiKey: options?.magpieApiKey,
                model: options?.magpieModel,
                customFetcher: options?.customFetcher,
              }));
          const [ocrErr, res] = await tryit(ocrFn)(imageUrls);
          return !ocrErr && res && res.trim() ? res.trim() : undefined;
        })()
      : undefined;

  return { aweme, transcript, ocrContent };
}
