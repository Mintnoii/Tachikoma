import { mkdir, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "pathe";
import { sift, tryit } from "radash";
import { toPosixPath } from "@dotagents/utils/path.ts";
import { IngestionResult, persistIngestionResult } from "@tachikoma/core";
import { openBrowserBridge, closeBrowserBridge } from "./bridge.js";
import { fetchAwemeDetail, fetchCollectList, fetchCollectAwemes } from "./client.js";
import { ocrGallery } from "./ocr.js";
import {
  openReconcilerDb,
  closeReconcilerDb,
  markSynced,
  filterUnsynced,
} from "./reconciliation.js";
import { DouyinAwemeItem, DouyinSyncOptions } from "./types.js";

/**
 * 下载媒体文件到沙盒/指定资产目录原子函数
 */
export async function downloadAsset(url: string, targetPath: string): Promise<string> {
  const posixPath = toPosixPath(targetPath);
  await tryit(mkdir)(dirname(posixPath), { recursive: true });

  const [fetchErr, res] = await tryit(fetch)(url);
  if (fetchErr || !res?.ok) {
    throw new Error(`下载媒体资源失败 (${res?.status}): ${url}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const [writeErr] = await tryit(writeFile)(posixPath, buffer);
  if (writeErr) {
    throw new Error(`保存媒体资源失败: ${posixPath} - ${writeErr.message}`);
  }
  return posixPath;
}

/**
 * 处理单条抖音作品：音视频/图集管线全流程（纯函数式流式处理，杜绝命令式 for 循环与 push 状态机）
 */
export async function processAweme(
  item: DouyinAwemeItem,
  options: DouyinSyncOptions,
  db?: DatabaseSync
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

  // 2. 视频管线：可选持久化 mp4
  const downloadedVideo =
    !isGallery && options.downloadMedia && item.videoPlayUrl
      ? await (async () => {
          const videoFile = join(assetBaseDir, `video_${item.id}.mp4`);
          const [err, savedPath] = await tryit(downloadAsset)(
            item.videoPlayUrl!,
            videoFile
          );
          return err || !savedPath ? [] : [savedPath];
        })()
      : [];

  const downloadedAssets = isGallery ? downloadedImages : downloadedVideo;

  // 正文生成
  const contentBody = isGallery
    ? await (async () => {
        const ocrSources = downloadedAssets.length > 0 ? downloadedAssets : images;
        const ocrMarkdown = options.customOcr
          ? await options.customOcr(ocrSources)
          : await ocrGallery(ocrSources, {
              baseUrl: options.magpieBaseUrl,
              apiKey: options.magpieApiKey,
              model: options.magpieModel,
              customFetcher: options.customFetcher,
            });
        return sift([
          `# ${title}`,
          "",
          `> 创作者: [${item.author.nickname}](https://www.douyin.com/user/${item.author.secUid})`,
          `> 发布时间: ${new Date(item.createTime * 1000).toISOString()}`,
          `> 原始链接: ${item.shareUrl}`,
          "",
          "## 图集作品 OCR 转录文字稿",
          "",
          ocrMarkdown,
        ]).join("\n");
      })()
    : sift([
        `# ${title}`,
        "",
        `> 创作者: [${item.author.nickname}](https://www.douyin.com/user/${item.author.secUid})`,
        `> 发布时间: ${new Date(item.createTime * 1000).toISOString()}`,
        `> 原始链接: ${item.shareUrl}`,
        "",
        "## 作品描述与要点",
        "",
        item.desc || "（原作者未填写文案描述）",
        "",
        item.videoPlayUrl ? `> 视频源直链: [播放链接](${item.videoPlayUrl})` : null,
      ]).join("\n");

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

  // 落盘至 outputDir/douyin/
  const { sha256 } = await persistIngestionResult(
    ingestionResult,
    options.outputDir,
    "douyin"
  );

  ingestionResult.sha256 = sha256;

  // 对账标记已同步
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
 * 纯函数原子流：同步单个抖音作品（支持分享链接或 aweme_id）
 */
export async function syncSingleAweme(
  urlOrId: string,
  options: DouyinSyncOptions
): Promise<{ filePath: string; sha256: string; result: IngestionResult }> {
  const dbPath = options.sqlitePath ?? options.dbPath;
  const db = dbPath ? openReconcilerDb(dbPath) : undefined;

  const bridge = openBrowserBridge({
    cdpEndpoint: options.cdpEndpoint,
    profileDir: options.profileDir,
    customTransport: options.customTransport,
  });

  try {
    const match = urlOrId.match(/(?:video\/|note\/|modal_id=)(\d+)/);
    const awemeId = match?.[1] ?? urlOrId.replace(/\D/g, "");
    const aweme = await fetchAwemeDetail(bridge, awemeId || urlOrId);
    const result = await processAweme(aweme, options, db);
    const targetPath = toPosixPath(
      join(options.outputDir, "douyin", `${result.title || "untitled"}.md`)
    );
    return { filePath: targetPath, sha256: result.sha256 ?? "", result };
  } finally {
    await closeBrowserBridge(bridge);
    if (db) {
      closeReconcilerDb(db);
    }
  }
}

/**
 * 纯函数原子流：增量同步抖音收藏夹并自动对账
 */
export async function syncCollections(
  options: DouyinSyncOptions,
  collectId?: string
): Promise<IngestionResult[]> {
  const targetCollectId = collectId ?? options.collectId;
  const dbPath = options.sqlitePath ?? options.dbPath;
  const db = dbPath ? openReconcilerDb(dbPath) : undefined;

  const bridge = openBrowserBridge({
    cdpEndpoint: options.cdpEndpoint,
    profileDir: options.profileDir,
    customTransport: options.customTransport,
  });

  try {
    const folderIds = targetCollectId
      ? [targetCollectId]
      : (await fetchCollectList(bridge)).folders.map((f) => f.id);

    const awemeLists = await Promise.all(
      folderIds.map(async (fid) => {
        const { items } = await fetchCollectAwemes(bridge, fid);
        return items;
      })
    );
    const allItems = awemeLists.flat();
    const unsyncedItems = db ? filterUnsynced(db, allItems) : allItems;

    return await Promise.all(unsyncedItems.map((item) => processAweme(item, options, db)));
  } finally {
    await closeBrowserBridge(bridge);
    if (db) {
      closeReconcilerDb(db);
    }
  }
}
