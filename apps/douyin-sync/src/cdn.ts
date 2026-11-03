import { DEFAULT_DESKTOP_USER_AGENT } from "@tachikoma/core";

/**
 * 抖音 CDN 防盗链请求头
 *
 * 抖音视频/图片资源托管在 `*.douyinvod.com` 等 CDN 上，缺 `Referer` 与浏览器 UA
 * 时直接返回 403。任何由 Node 侧直连 CDN 的下载都必须带上这组头。
 *
 * @example
 * await fetch(playUrl, { headers: DOUYIN_CDN_HEADERS });
 */
export const DOUYIN_CDN_HEADERS = {
  "User-Agent": DEFAULT_DESKTOP_USER_AGENT,
  Referer: "https://www.douyin.com/",
  Range: "bytes=0-",
} as const;
