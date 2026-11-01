import { tryit } from "radash";
import {
  withBrowserPage,
  extractDouyinUrlOrId,
  type DouyinUrlOrId,
  safeJsonParse,
} from "@tachikoma/core";
import { normalizeAweme } from "./client.js";
import { DouyinAwemeItem } from "./types.js";

export { extractDouyinUrlOrId, type DouyinUrlOrId };

export interface PublicAwemeOptions {
  timeoutMs?: number;
  headless?: boolean;
  cdpEndpoint?: string;
  customExtractor?: (urlOrId: string) => Promise<DouyinAwemeItem>;
  customTransport?: (path: string, params?: Record<string, unknown>) => Promise<any>;
}

/**
 * 现代 TypeScript 单条公开作品免登录纯内存解析器
 * 基于无头 Playwright，零 Cookie、零 Profile 目录，彻底匿名无痕提取作品元数据与媒体资源
 */
export async function fetchPublicAwemeItem(
  urlOrId: string,
  options?: PublicAwemeOptions
): Promise<DouyinAwemeItem> {
  // 1. 测试沙盒/外部注入提取器优先
  if (options?.customExtractor) {
    return await options.customExtractor(urlOrId);
  }

  // 2. 模拟同源传输层（单元测试兼容器）
  if (options?.customTransport) {
    const extracted = extractDouyinUrlOrId(urlOrId);
    const targetId = extracted.awemeId || urlOrId;
    const raw = await options.customTransport("/aweme/v1/web/aweme/detail/", {
      aweme_id: targetId,
    });
    return normalizeAweme(raw?.aweme_detail ?? raw);
  }

  const extracted = extractDouyinUrlOrId(urlOrId);
  const targetUrl =
    extracted.url ||
    (extracted.awemeId
      ? `https://www.iesdouyin.com/share/video/${extracted.awemeId}`
      : urlOrId);

  return await withBrowserPage({ ...options, isMobile: true }, async (page) => {
    let interceptedData: any = null;

    // 监听网络请求中的作品详情 JSON（优先捕获官方接口流）
    page.on("response", async (response) => {
      const respUrl = response.url();
      if (
        respUrl.includes("/aweme/v1/web/aweme/detail/") ||
        respUrl.includes("/web/api/v2/aweme/iteminfo/") ||
        respUrl.includes("/aweme/detail/")
      ) {
        const [err, json] = await tryit(async () => await response.json())();
        if (!err && json) {
          const candidate = json.aweme_detail ?? json.item_list?.[0] ?? json.aweme;
          if (candidate) {
            interceptedData = candidate;
          }
        }
      }
    });

    const timeout = options?.timeoutMs ?? 25000;
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    // 若网络拦截未直接命中，从页面执行环境或 DOM 中声明式提取
    const inPageData = await page.evaluate(() => {
      const findCandidate = (dict: unknown) => {
        if (!dict || typeof dict !== "object") return null;
        return (
          Object.values(dict)
            .map(
              (v: any) =>
                v?.videoInfoRes?.item_list?.[0] ??
                v?.aweme_detail ??
                v?.itemInfo?.itemStruct
            )
            .find(Boolean) ?? null
        );
      };

      // 1. window._ROUTER_DATA
      const routerCandidate = findCandidate(
        (window as any)._ROUTER_DATA?.loaderData
      );
      if (routerCandidate) return { candidate: routerCandidate };

      // 2. window.__INITIAL_STATE__
      const initState = (window as any).__INITIAL_STATE__;
      const initCandidate =
        initState?.aweme?.detail ?? initState?.itemInfo?.itemStruct ?? null;
      if (initCandidate) return { candidate: initCandidate };

      // 3. <script id="RENDER_DATA">
      const renderText = document.querySelector("#RENDER_DATA")?.textContent?.trim() || null;

      // 4. DOM 启发式回退提取
      const desc =
        document.querySelector(".desc")?.textContent ||
        document.querySelector("meta[name='description']")?.getAttribute("content") ||
        document.querySelector("meta[property='og:title']")?.getAttribute("content") ||
        document.title ||
        "";

      const authorNickname =
        document.querySelector(".author-name")?.textContent ||
        document.querySelector(".account-name")?.textContent ||
        document.querySelector("meta[property='og:author']")?.getAttribute("content") ||
        "未知作者";

      const authorSecUid =
        document.querySelector("[data-e2e='user-info']")?.getAttribute("data-secuid") ||
        document.querySelector("a[href*='/user/']")?.getAttribute("href")?.split("/user/")[1]?.split("?")[0] ||
        "";

      const imgNodes = Array.from(
        document.querySelectorAll(
          ".gallery-image, .slider-image, img.slide, [data-e2e='note-image'] img, .swiper-slide img"
        )
      );
      const images = imgNodes
        .map((img) => (img as HTMLImageElement).src)
        .filter((src) => Boolean(src) && !src.includes("avatar"));

      const videoEl = document.querySelector("video") as HTMLVideoElement | null;
      const videoPlayUrl = videoEl?.src || videoEl?.querySelector("source")?.src;

      const domFallback = {
        desc: desc.trim(),
        author: { nickname: authorNickname.trim(), sec_uid: authorSecUid },
        images: images.map((url) => ({ url_list: [url] })),
        video: videoPlayUrl ? { play_addr: { url_list: [videoPlayUrl] } } : undefined,
        aweme_type: images.length > 0 ? 68 : 4,
      };

      return {
        candidate: null,
        renderText,
        domFallback,
      };
    });

    const finalUrl = page.url();
    const finalIdMatch = finalUrl.match(/(?:video\/|note\/|modal_id=)(\d+)/);
    const resolvedId = finalIdMatch?.[1] ?? extracted.awemeId ?? "";

    const inPageCandidate =
      inPageData.candidate ??
      (() => {
        if (inPageData.renderText) {
          const [decodeErr, decoded] = tryit(decodeURIComponent)(inPageData.renderText);
          if (!decodeErr && decoded) {
            const parsed = safeJsonParse<Record<string, any>>(decoded, {});
            return (
              Object.values(parsed)
                .map(
                  (val: any) =>
                    val?.videoInfoRes?.item_list?.[0] ?? val?.aweme_detail
                )
                .find(Boolean) ?? null
            );
          }
        }
        return null;
      })() ??
      inPageData.domFallback;

    const raw = interceptedData ?? inPageCandidate;
    if (!raw) {
      throw new Error(`[PublicAweme] 无法从作品页面提取数据: ${urlOrId}`);
    }

    if (!raw.aweme_id && !raw.id && resolvedId) {
      raw.aweme_id = resolvedId;
    }

    return normalizeAweme(raw);
  });
}
