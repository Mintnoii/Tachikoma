import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { sift, tryit } from "radash";
import { normalizeAweme } from "./client.js";
import { DouyinAwemeItem } from "./types.js";

export interface PublicAwemeOptions {
  timeoutMs?: number;
  headless?: boolean;
  cdpEndpoint?: string;
  customExtractor?: (urlOrId: string) => Promise<DouyinAwemeItem>;
  customTransport?: (path: string, params?: Record<string, unknown>) => Promise<any>;
}

const IPHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

/**
 * 纯函数：从任意输入文本提取抖音作品 URL 或 aweme_id
 */
export function extractDouyinUrlOrId(input: string): { url?: string; awemeId?: string } {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) {
    const rawUrl = urlMatch[0];
    const idMatch = rawUrl.match(/(?:video\/|note\/|modal_id=)(\d+)/);
    return {
      url: rawUrl,
      awemeId: idMatch?.[1],
    };
  }

  const digitsMatch = trimmed.match(/\d{15,22}/);
  if (digitsMatch) {
    return { awemeId: digitsMatch[0] };
  }

  const numericOnly = trimmed.replace(/\D/g, "");
  return { awemeId: numericOnly || undefined };
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

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let interceptedData: any = null;

  try {
    if (options?.cdpEndpoint) {
      browser = await chromium.connectOverCDP(options.cdpEndpoint);
      context = browser.contexts()[0] ?? (await browser.newContext());
    } else {
      browser = await chromium.launch({
        headless: options?.headless ?? true,
        args: [
          "--no-startup-window",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
        ],
      });
      // 纯内存无痕隔离上下文：零 Cookie、零持久化 Profile
      context = await browser.newContext({
        userAgent: IPHONE_USER_AGENT,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
    }

    page = await context.newPage();

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

    // 若网络拦截未直接命中，从页面执行环境或 DOM 中提取
    const inPageData = await page.evaluate(() => {
      // 1. 检查 window._ROUTER_DATA
      const routerData = (window as any)._ROUTER_DATA;
      if (routerData?.loaderData) {
        const ld = routerData.loaderData;
        for (const k of Object.keys(ld)) {
          const candidate =
            ld[k]?.videoInfoRes?.item_list?.[0] ??
            ld[k]?.aweme_detail ??
            ld[k]?.itemInfo?.itemStruct;
          if (candidate) return candidate;
        }
      }

      // 2. 检查 <script id="RENDER_DATA">
      const renderEl = document.querySelector("#RENDER_DATA");
      if (renderEl?.textContent) {
        try {
          const decoded = decodeURIComponent(renderEl.textContent);
          const parsed = JSON.parse(decoded);
          for (const k of Object.keys(parsed)) {
            const candidate =
              parsed[k]?.videoInfoRes?.item_list?.[0] ??
              parsed[k]?.aweme_detail;
            if (candidate) return candidate;
          }
        } catch {}
      }

      // 3. 检查 window.__INITIAL_STATE__
      const initState = (window as any).__INITIAL_STATE__;
      if (initState) {
        const candidate = initState.aweme?.detail ?? initState.itemInfo?.itemStruct;
        if (candidate) return candidate;
      }

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

      return {
        desc: desc.trim(),
        author: { nickname: authorNickname.trim(), sec_uid: authorSecUid },
        images: images.map((url) => ({ url_list: [url] })),
        video: videoPlayUrl ? { play_addr: { url_list: [videoPlayUrl] } } : undefined,
        aweme_type: images.length > 0 ? 68 : 4,
      };
    });

    const finalUrl = page.url();
    const finalIdMatch = finalUrl.match(/(?:video\/|note\/|modal_id=)(\d+)/);
    const resolvedId = finalIdMatch?.[1] ?? extracted.awemeId ?? "";

    const raw = interceptedData ?? inPageData;
    if (!raw) {
      throw new Error(`[PublicAweme] 无法从作品页面提取数据: ${urlOrId}`);
    }

    if (!raw.aweme_id && !raw.id && resolvedId) {
      raw.aweme_id = resolvedId;
    }

    return normalizeAweme(raw);
  } finally {
    if (page) await tryit(page.close.bind(page))();
    if (context) await tryit(context.close.bind(context))();
    if (browser && !options?.cdpEndpoint) {
      await tryit(browser.close.bind(browser))();
    }
  }
}
