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
    version_code: "170400",
    version_name: "17.4.0",
  });

  const list = raw?.collects_list ?? [];
  const folders: DouyinCollectionFolder[] = list.map((item: any) => ({
    id: String(item.collects_id),
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
 * 纯函数：获取单条作品详情
 */
export const fetchAwemeDetail = async (
  bridge: BrowserBridge,
  awemeId: string
): Promise<DouyinAwemeItem> => {
  const raw = await bridge.requestJson("/aweme/v1/web/aweme/detail/", {
    aweme_id: awemeId,
    // 必须带 aid/device_platform：缺省时图文作品会被按 web 端保守策略过滤（aweme_detail 为空）
    device_platform: "webapp",
    aid: 6383,
  });
  return normalizeAweme(raw?.aweme_detail ?? raw);
};
