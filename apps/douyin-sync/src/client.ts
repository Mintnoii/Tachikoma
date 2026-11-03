import { sift } from "radash";
import { BrowserBridge } from "./bridge.js";
import { DouyinAwemeItem, DouyinCollectionFolder } from "./types.js";

/**
 * 纯函数：规范化单条抖音作品数据
 */
export const normalizeAweme = (raw: any): DouyinAwemeItem => {
  const awemeId = String(raw?.aweme_id ?? raw?.id ?? "");
  const desc = String(raw?.desc ?? "").trim();
  const authorRaw = raw?.author ?? {};
  const author = {
    uid: String(authorRaw.uid ?? ""),
    secUid: String(authorRaw.sec_uid ?? authorRaw.secUid ?? ""),
    nickname: String(authorRaw.nickname || "未知作者"),
    avatarUrl:
      authorRaw.avatar_thumb?.url_list?.[0] ??
      authorRaw.avatar_larger?.url_list?.[0] ??
      authorRaw.avatarUrl,
  };

  const rawImages = raw?.images ?? raw?.image_list ?? [];
  const imageUrls = sift<string>(
    rawImages.map((img: any) => {
      if (typeof img === "string") return img;
      return img?.url_list?.[0] ?? img?.download_url_list?.[0] ?? img?.url ?? null;
    })
  );
  const isGallery = raw?.aweme_type === 68 || imageUrls.length > 0;
  const videoUrlList = sift<string>([
    ...(raw?.video?.play_addr?.url_list ?? []),
    ...(raw?.video?.play_addr_h264?.url_list ?? []),
  ]);
  const videoPlayUrl =
    videoUrlList[0] ??
    raw?.video_play_url ??
    raw?.videoPlayUrl;
  const stats = raw?.statistics ?? {};

  return {
    id: awemeId,
    desc: desc || `抖音作品_${awemeId}`,
    author,
    createTime: Number(raw?.create_time || raw?.createTime || Math.floor(Date.now() / 1000)),
    mediaType: isGallery ? "gallery" : "video",
    videoPlayUrl,
    videoUrlList: videoUrlList.length > 0 ? videoUrlList : undefined,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    shareUrl: raw?.share_url || (awemeId ? `https://www.douyin.com/video/${awemeId}` : ""),
    statistics: {
      diggCount: stats.digg_count ?? stats.diggCount,
      commentCount: stats.comment_count ?? stats.commentCount,
      collectCount: stats.collect_count ?? stats.collectCount,
      shareCount: stats.share_count ?? stats.shareCount,
    },
    raw,
  };
};

/**
 * 纯函数：查询用户收藏夹列表
 */
export const fetchCollectList = async (
  bridge: BrowserBridge,
  cursor: number = 0,
  count: number = 10
): Promise<{ folders: DouyinCollectionFolder[]; hasMore: boolean; cursor: number }> => {
  const raw = await bridge.requestJson("/aweme/v1/web/collects/list/", {
    cursor,
    count,
    // aid / device_platform 缺省时接口返回空列表（与 detail 同一套上下文校验）
    device_platform: "webapp",
    aid: 6383,
    version_code: "170400",
    version_name: "17.4.0",
  });

  const list = raw?.collects_list ?? [];
  const folders: DouyinCollectionFolder[] = list.map((item: any) => ({
    // collects_id 是 19 位整型，JS Number 会丢精度（末位被抹成 0），必须优先用字符串字段
    id: String(item.collects_id_str ?? item.collects_id),
    name: String(item.collects_name || "未命名收藏夹"),
    totalCount: Number(item.total_number ?? 0),
    coverUrl: item.cover_url?.url_list?.[0],
  }));

  return {
    folders,
    hasMore: Boolean(raw?.has_more),
    cursor: Number(raw?.cursor ?? 0),
  };
};

/**
 * 纯函数：获取指定收藏夹作品列表
 */
export const fetchCollectAwemes = async (
  bridge: BrowserBridge,
  collectsId: string,
  cursor: number = 0,
  count: number = 10
): Promise<{ items: DouyinAwemeItem[]; hasMore: boolean; cursor: number }> => {
  const raw = await bridge.requestJson("/aweme/v1/web/collects/video/list/", {
    collects_id: collectsId,
    cursor,
    count,
    device_platform: "webapp",
    aid: 6383,
    version_code: "170400",
    version_name: "17.4.0",
  });

  const items = (raw?.aweme_list ?? []).map((item: any) => normalizeAweme(item));

  return {
    items,
    hasMore: Boolean(raw?.has_more),
    cursor: Number(raw?.cursor ?? 0),
  };
};

/**
 * 纯函数：全量游标分页获取所有收藏夹列表（直至 hasMore 为 false 或防环上限）
 */
export const fetchAllCollectFolders = async (
  bridge: BrowserBridge,
  pageSize = 30,
  maxPages = 20
): Promise<DouyinCollectionFolder[]> => {
  const folders: DouyinCollectionFolder[] = [];
  const seenIds = new Set<string>();
  let cursor = 0;
  let hasMore = true;
  let page = 0;

  while (hasMore && page < maxPages) {
    const res = await fetchCollectList(bridge, cursor, pageSize);
    for (const f of res.folders) {
      if (!seenIds.has(f.id)) {
        seenIds.add(f.id);
        folders.push(f);
      }
    }
    hasMore = res.hasMore && res.folders.length > 0;
    cursor = res.cursor;
    page++;
  }

  return folders;
};

/**
 * 纯函数：全量游标分页获取指定收藏夹内的所有作品（支持 maxCount 截断）
 */
export const fetchAllCollectAwemes = async (
  bridge: BrowserBridge,
  collectsId: string,
  maxCount = 0,
  pageSize = 20,
  maxPages = 50,
  startCursor = 0
): Promise<{ items: DouyinAwemeItem[]; nextCursor: number; hasMore: boolean }> => {
  const items: DouyinAwemeItem[] = [];
  const seenIds = new Set<string>();
  let cursor = startCursor;
  let hasMore = true;
  let page = 0;

  while (hasMore && page < maxPages) {
    const res = await fetchCollectAwemes(bridge, collectsId, cursor, pageSize);
    for (const it of res.items) {
      if (!seenIds.has(it.id)) {
        seenIds.add(it.id);
        items.push(it);
        if (maxCount > 0 && items.length >= maxCount) {
          return { items: items.slice(0, maxCount), nextCursor: res.cursor, hasMore: res.hasMore };
        }
      }
    }
    hasMore = res.hasMore && res.items.length > 0;
    cursor = res.cursor;
    page++;
  }

  return { items, nextCursor: cursor, hasMore };
};

/**
 * 纯函数：获取指定合集作品列表
 */
export const fetchMixAwemes = async (
  bridge: BrowserBridge,
  mixId: string,
  cursor: number = 0,
  count: number = 20
): Promise<{ items: DouyinAwemeItem[]; hasMore: boolean; cursor: number }> => {
  const raw = await bridge.requestJson("/aweme/v1/web/mix/aweme/", {
    mix_id: mixId,
    cursor,
    count,
    device_platform: "webapp",
    aid: 6383,
    version_code: "170400",
    version_name: "17.4.0",
  });

  const items = (raw?.aweme_list ?? []).map((item: any) => normalizeAweme(item));

  return {
    items,
    hasMore: Boolean(raw?.has_more),
    cursor: Number(raw?.cursor ?? raw?.next_cursor ?? 0),
  };
};

/**
 * 纯函数：全量游标分页获取指定合集内的所有作品（支持 maxCount 截断与 startCursor 断点游标）
 */
export const fetchAllMixAwemes = async (
  bridge: BrowserBridge,
  mixId: string,
  maxCount = 0,
  pageSize = 20,
  maxPages = 50,
  startCursor = 0
): Promise<{ items: DouyinAwemeItem[]; nextCursor: number; hasMore: boolean }> => {
  const items: DouyinAwemeItem[] = [];
  const seenIds = new Set<string>();
  let cursor = startCursor;
  let hasMore = true;
  let page = 0;

  while (hasMore && page < maxPages) {
    const res = await fetchMixAwemes(bridge, mixId, cursor, pageSize);
    for (const it of res.items) {
      if (!seenIds.has(it.id)) {
        seenIds.add(it.id);
        items.push(it);
        if (maxCount > 0 && items.length >= maxCount) {
          return { items: items.slice(0, maxCount), nextCursor: res.cursor, hasMore: res.hasMore };
        }
      }
    }
    hasMore = res.hasMore && res.items.length > 0;
    cursor = res.cursor;
    page++;
  }

  return { items, nextCursor: cursor, hasMore };
};

/**
 * 纯函数：获取指定作者主页作品列表
 */
export const fetchAuthorAwemes = async (
  bridge: BrowserBridge,
  secUserId: string,
  maxCursor: number = 0,
  count: number = 18
): Promise<{ items: DouyinAwemeItem[]; hasMore: boolean; cursor: number }> => {
  const raw = await bridge.requestJson("/aweme/v1/web/aweme/post/", {
    sec_user_id: secUserId,
    max_cursor: maxCursor,
    count,
    device_platform: "webapp",
    aid: 6383,
    version_code: "170400",
    version_name: "17.4.0",
  });

  const items = (raw?.aweme_list ?? []).map((item: any) => normalizeAweme(item));

  return {
    items,
    hasMore: Boolean(raw?.has_more),
    cursor: Number(raw?.max_cursor ?? raw?.cursor ?? 0),
  };
};

/**
 * 纯函数：全量游标分页获取指定作者主页内的所有作品（支持 maxCount 截断与 startCursor 断点游标）
 */
export const fetchAllAuthorAwemes = async (
  bridge: BrowserBridge,
  secUserId: string,
  maxCount = 0,
  pageSize = 18,
  maxPages = 50,
  startCursor = 0
): Promise<{ items: DouyinAwemeItem[]; nextCursor: number; hasMore: boolean }> => {
  const items: DouyinAwemeItem[] = [];
  const seenIds = new Set<string>();
  let cursor = startCursor;
  let hasMore = true;
  let page = 0;

  while (hasMore && page < maxPages) {
    const res = await fetchAuthorAwemes(bridge, secUserId, cursor, pageSize);
    for (const it of res.items) {
      if (!seenIds.has(it.id)) {
        seenIds.add(it.id);
        items.push(it);
        if (maxCount > 0 && items.length >= maxCount) {
          return { items: items.slice(0, maxCount), nextCursor: res.cursor, hasMore: res.hasMore };
        }
      }
    }
    hasMore = res.hasMore && res.items.length > 0;
    cursor = res.cursor;
    page++;
  }

  return { items, nextCursor: cursor, hasMore };
};
