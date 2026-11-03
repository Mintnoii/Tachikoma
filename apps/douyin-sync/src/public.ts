import { sleep, tryit } from "radash";
import {
  withBrowserPage,
  withPersistentBrowserContext,
  extractDouyinUrlOrId,
  type DouyinUrlOrId,
  safeJsonParse,
  toPageScript,
} from "@tachikoma/core";
import { normalizeAweme } from "./client.js";
import {
  DouyinAwemeItem,
  DouyinExtractionSource,
  DouyinExtractionConfidence,
} from "./types.js";
import { DouyinExtractionError, DouyinExtractionReason } from "./errors.js";
import { hasDouyinSession, type DouyinSessionStatus } from "./session.js";
import type { Page } from "playwright-core";

export { extractDouyinUrlOrId, type DouyinUrlOrId };

export interface PublicAwemeSessionOption {
  userDataDir: string;
  hasSession?: (userDataDir: string) => Promise<DouyinSessionStatus>;
}

export interface PublicAwemeOptions {
  timeoutMs?: number;
  headless?: boolean;
  cdpEndpoint?: string;
  isMobile?: boolean;
  customExtractor?: (
    urlOrId: string,
    context?: { isAuthed?: boolean }
  ) => Promise<DouyinAwemeItem>;
  customTransport?: (path: string, params?: Record<string, unknown>) => Promise<any>;
  session?: PublicAwemeSessionOption;
  customAuthedExtractor?: (urlOrId: string) => Promise<DouyinAwemeItem>;
}

export interface PageExtractionResult {
  candidate: Record<string, any> | null;
  source?: DouyinExtractionSource;
  confidence?: DouyinExtractionConfidence;
  attempts: string[];
  failureReason?: DouyinExtractionReason;
}

/**
 * 纯函数：递归深度搜索作品数据（抗改版核心算法，防环 + 最大深度控制）
 * 命中条件：
 * 1. 对象含非空 item_list 数组且首元素为对象
 * 2. 对象含 aweme_detail 对象
 * 3. 对象同时含 aweme_id / id 以及 video / images 媒体字段
 */
export function deepFindAwemeItem(
  value: unknown,
  maxDepth = 8,
  visited = new Set<unknown>()
): Record<string, any> | null {
  if (value === null || typeof value !== "object" || maxDepth < 0 || visited.has(value)) {
    return null;
  }

  visited.add(value);

  const obj = value as Record<string, any>;

  // 1. 含非空 item_list 数组且首元素为对象
  if (
    Array.isArray(obj.item_list) &&
    obj.item_list.length > 0 &&
    obj.item_list[0] &&
    typeof obj.item_list[0] === "object"
  ) {
    return obj.item_list[0];
  }

  // 2. 含 aweme_detail 对象
  if (obj.aweme_detail && typeof obj.aweme_detail === "object") {
    return obj.aweme_detail;
  }

  // 3. 同时含 aweme_id/id 与 video/images
  const hasId = Boolean(obj.aweme_id || obj.id);
  const hasMedia = Boolean(obj.video || obj.images || obj.image_urls || obj.image_list);
  if (hasId && hasMedia) {
    return obj;
  }

  // 递归遍历子节点（支持数组与普通对象，纯函数式短路聚合，无游标循环）
  const entries: unknown[] = Array.isArray(value) ? value : Object.values(obj);

  return entries.reduce<Record<string, any> | null>(
    (acc, child) => acc ?? deepFindAwemeItem(child, maxDepth - 1, visited),
    null
  );
}

/**
 * 纯函数：解码并解析 <script id="RENDER_DATA"> 中的 URI 编码 JSON 数据
 */
export function extractFromRenderData(rawText: string): Record<string, any> | null {
  if (!rawText || !rawText.trim()) return null;
  const [decodeErr, decoded] = tryit(decodeURIComponent)(rawText.trim());
  if (decodeErr || !decoded) return null;
  const parsed = safeJsonParse<Record<string, any>>(decoded, {});
  return deepFindAwemeItem(parsed);
}

const SSR_EXTRACT_SCRIPT = `
() => {
  const deepFind = (val, maxDepth = 8, visited = new Set()) => {
    if (!val || typeof val !== "object" || maxDepth < 0 || visited.has(val)) return null;
    visited.add(val);
    if (
      Array.isArray(val.item_list) &&
      val.item_list.length > 0 &&
      val.item_list[0] &&
      typeof val.item_list[0] === "object"
    ) {
      return val.item_list[0];
    }
    if (val.aweme_detail && typeof val.aweme_detail === "object") {
      return val.aweme_detail;
    }
    const hasId = Boolean(val.aweme_id || val.id);
    const hasMedia = Boolean(val.video || val.images || val.image_urls || val.image_list);
    if (hasId && hasMedia) return val;
    const entries = Array.isArray(val) ? val : Object.values(val);
    return entries.reduce((acc, child) => acc ?? deepFind(child, maxDepth - 1, visited), null);
  };

  const w = window;
  const routerCandidate = deepFind(w._ROUTER_DATA?.loaderData ?? w._ROUTER_DATA);
  if (routerCandidate) return { sourceName: "_ROUTER_DATA", candidate: routerCandidate };

  const initCandidate = deepFind(w.__INITIAL_STATE__);
  if (initCandidate) return { sourceName: "__INITIAL_STATE__", candidate: initCandidate };

  const propsCandidate = deepFind(w.__INIT_PROPS__);
  if (propsCandidate) return { sourceName: "__INIT_PROPS__", candidate: propsCandidate };

  return null;
}
`;

const GET_RENDER_TEXT_SCRIPT = `() => document.querySelector("#RENDER_DATA")?.textContent?.trim() || null`;

const IN_PAGE_FETCH_SCRIPT = `
async (awemeId) => {
  try {
    const resp = await fetch(
      // aid / device_platform 必须带：缺省时抖音按 web 端最保守策略返回空壳或 images_base 过滤
      "/aweme/v1/web/aweme/detail/?aweme_id=" +
        encodeURIComponent(awemeId) +
        "&device_platform=webapp&aid=6383",
      {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
        },
      }
    );
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: "HTTP " + resp.status };
    }
    const data = await resp.json();
    return { ok: true, status: resp.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}
`;

const DOM_FALLBACK_SCRIPT = `
() => {
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
    .map((img) => img.src)
    .filter((src) => Boolean(src) && !src.includes("avatar"));

  const videoEl = document.querySelector("video");
  const videoPlayUrl = videoEl?.src || videoEl?.querySelector("source")?.src;

  const trimmedDesc = desc.trim();
  // 纯空页面或只有泛用标题 "抖音" 无其他实质内容时不视为有效 DOM
  const isGenericTitle = trimmedDesc === "抖音" || trimmedDesc === "抖音短视频";
  const hasMeaningfulContent =
    (Boolean(trimmedDesc) && !isGenericTitle) ||
    images.length > 0 ||
    Boolean(videoPlayUrl);

  if (!hasMeaningfulContent) return null;

  return {
    desc: trimmedDesc,
    author: { nickname: authorNickname.trim(), sec_uid: authorSecUid },
    images: images.map((url) => ({ url_list: [url] })),
    video: videoPlayUrl ? { play_addr: { url_list: [videoPlayUrl] } } : undefined,
    aweme_type: images.length > 0 ? 68 : 4,
  };
}
`;

/**
 * 页面上下文多路径串行提取器：SSR 变量 -> RENDER_DATA -> 页内同源 XHR -> DOM
 */
export async function extractFromPageContext(
  page: Page,
  targetAwemeId?: string
): Promise<PageExtractionResult> {
  // 1. SSR 注入变量检查 (_ROUTER_DATA, __INITIAL_STATE__, __INIT_PROPS__)
  const ssrMatch = (await page.evaluate(toPageScript(SSR_EXTRACT_SCRIPT), undefined)) as {
    sourceName: string;
    candidate: Record<string, any>;
  } | null;

  const ssrAttempts = ["ssr:_ROUTER_DATA", "ssr:__INITIAL_STATE__", "ssr:__INIT_PROPS__"];

  if (ssrMatch?.candidate) {
    return {
      candidate: ssrMatch.candidate,
      source: "ssr",
      confidence: "high",
      attempts: [`ssr:${ssrMatch.sourceName}`],
    };
  }

  // 2. <script id="RENDER_DATA"> 路径
  const renderText = (await page.evaluate(toPageScript(GET_RENDER_TEXT_SCRIPT), undefined)) as string | null;

  const renderCandidate = renderText ? extractFromRenderData(renderText) : null;
  if (renderCandidate) {
    return {
      candidate: renderCandidate,
      source: "render-data",
      confidence: "high",
      attempts: [...ssrAttempts, "render-data"],
    };
  }

  const baseAttempts = [...ssrAttempts, "render-data"];

  // 3. 页内同源 XHR 路径 (/aweme/v1/web/aweme/detail/?aweme_id=...)
  const xhrResult = targetAwemeId
    ? ((await page.evaluate(toPageScript(IN_PAGE_FETCH_SCRIPT), targetAwemeId)) as {
        ok: boolean;
        status: number;
        data?: any;
        error?: string;
      })
    : null;

  const xhrAttemptKey = targetAwemeId
    ? `in-page-xhr:/aweme/v1/web/aweme/detail/?aweme_id=${targetAwemeId}`
    : "in-page-xhr:skipped";

  const xhrCandidate = xhrResult?.ok && xhrResult.data ? deepFindAwemeItem(xhrResult.data) : null;
  if (xhrCandidate) {
    return {
      candidate: xhrCandidate,
      source: "in-page-xhr",
      confidence: "high",
      attempts: [...baseAttempts, xhrAttemptKey],
    };
  }

  const postXhrAttempts = [...baseAttempts, xhrAttemptKey];

  // 抖音对图文做了上下文过滤：从非作品页发起 detail 会返回 aweme_detail:null + filter_reason:images_base
  const filterReason = xhrResult?.data?.filter_detail?.filter_reason;
  const lastReason: DouyinExtractionReason =
    filterReason === "images_base"
      ? "images-filtered"
      : xhrResult && xhrResult.status === 403
        ? "api-forbidden"
        : "ssr-no-item";

  // 4. DOM 启发式兜底
  const domFallback = (await page.evaluate(toPageScript(DOM_FALLBACK_SCRIPT), undefined)) as Record<
    string,
    any
  > | null;

  if (domFallback) {
    return {
      candidate: domFallback,
      source: "dom",
      confidence: "dom-fallback",
      attempts: [...postXhrAttempts, "dom-fallback"],
    };
  }

  return {
    candidate: null,
    attempts: [...postXhrAttempts, "dom-fallback"],
    failureReason:
      lastReason === "images-filtered"
        ? "images-filtered"
        : lastReason === "api-forbidden"
          ? "api-forbidden"
          : "dom-fallback-empty",
  };
}

/**
 * 图文作品被上下文过滤时，改用作品页（note）重试一次
 *
 * 抖音只在作品页自身的上下文里放行图文 detail；从视频页/首页发起会被
 * `filter_reason=images_base` 拦掉。同一作品最多重试一次，避免风控。
 */
async function retryViaNotePage(
  page: Page,
  awemeId: string,
  first: PageExtractionResult,
  timeoutMs: number
): Promise<PageExtractionResult> {
  if (!awemeId || page.url().includes(`/note/${awemeId}`)) {
    return first;
  }

  const [err] = await tryit(() =>
    page.goto(`https://www.douyin.com/note/${awemeId}`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    })
  )();
  if (err) return first;

  await sleep(1200);
  const second = await extractFromPageContext(page, awemeId);
  return {
    ...second,
    attempts: [...first.attempts, `retry-note-page:${awemeId}`, ...second.attempts],
  };
}

/**
 * 从运行期页面上下文提取作品并标准化（统一网络拦截与多路径降级）
 */
async function extractAwemeFromLivePage(
  page: Page,
  urlOrId: string,
  timeoutMs: number
): Promise<DouyinAwemeItem> {
  const extracted = extractDouyinUrlOrId(urlOrId);
  // 落地页必须是作品页本身：分享页（iesdouyin）SSR 已无 videoInfoRes，且图文会因上下文不符被过滤
  const targetUrl =
    extracted.url ||
    (extracted.awemeId
      ? `https://www.douyin.com/video/${extracted.awemeId}`
      : urlOrId);

  const interceptedRef: { data: any } = { data: null };

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
        const candidate = deepFindAwemeItem(json);
        if (candidate) {
          interceptedRef.data = candidate;
        }
      }
    }
  });

  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });

  // 短暂等待客户端异步 XHR 与网络响应完成（至多等待 4 秒，捕获后立即短路）
  const waitForIntercepted = async (attemptsLeft: number): Promise<void> => {
    if (interceptedRef.data || attemptsLeft <= 0 || page.isClosed()) {
      return;
    }
    await sleep(200);
    return waitForIntercepted(attemptsLeft - 1);
  };
  await waitForIntercepted(20);

  const finalUrl = page.url();
  const finalIdMatch = finalUrl.match(/(?:video\/|note\/|modal_id=)(\d+)/);
  const resolvedId = finalIdMatch?.[1] ?? extracted.awemeId ?? "";

  const extraction: PageExtractionResult = interceptedRef.data
    ? {
        candidate: interceptedRef.data,
        source: "ssr",
        confidence: "high",
        attempts: ["network-response-intercept"],
      }
    : await extractFromPageContext(page, resolvedId);

  // 图文被上下文过滤时，改用作品页（note）重试一次：detail 只在作品页上下文放行
  const finalExtraction = extraction.candidate
    ? extraction
    : await retryViaNotePage(page, resolvedId, extraction, timeoutMs);

  const raw = finalExtraction.candidate;
  if (!raw) {
    throw new DouyinExtractionError(
      finalExtraction.failureReason ?? "ssr-no-item",
      `[PublicAweme] 无法从作品页面提取数据: ${urlOrId}`,
      { attempts: finalExtraction.attempts }
    );
  }

  if (!raw.aweme_id && !raw.id && resolvedId) {
    raw.aweme_id = resolvedId;
  }

  const normalized = normalizeAweme(raw);
  return {
    ...normalized,
    source: extraction.source,
    confidence: extraction.confidence,
  };
}

/**
 * 现代 TypeScript 单条公开作品免登录纯内存解析器（带登录态通道自动兜底）
 * 1. 默认优先尝试彻底匿名无痕提取作品元数据与媒体资源
 * 2. 匿名全败时，若配置且检测到有效 session，以持久化上下文重跑同一套多路径提取
 */
export async function fetchPublicAwemeItem(
  urlOrId: string,
  options?: PublicAwemeOptions
): Promise<DouyinAwemeItem> {
  const timeout = options?.timeoutMs ?? 25000;

  // 1. 匿名提取尝试
  const runAnonymous = async (): Promise<DouyinAwemeItem> => {
    if (options?.customExtractor) {
      const extracted = await options.customExtractor(urlOrId, { isAuthed: false });
      return {
        ...extracted,
        source: extracted.source ?? "ssr",
        confidence: extracted.confidence ?? "high",
      };
    }

    if (options?.customTransport) {
      const extracted = extractDouyinUrlOrId(urlOrId);
      const targetId = extracted.awemeId || urlOrId;
      const raw = await options.customTransport("/aweme/v1/web/aweme/detail/", {
        aweme_id: targetId,
        device_platform: "webapp",
        aid: 6383,
      });
      const normalized = normalizeAweme(raw?.aweme_detail ?? raw);
      return {
        ...normalized,
        source: "in-page-xhr",
        confidence: "high",
      };
    }

    return await withBrowserPage({ ...options, isMobile: true }, async (page) => {
      return await extractAwemeFromLivePage(page, urlOrId, timeout);
    });
  };

  const [anonErr, anonItem] = await tryit(runAnonymous)();
  if (!anonErr && anonItem) {
    return anonItem;
  }

  // 2. 匿名全败且 session 存在时的自动兜底
  const session = options?.session;
  if (!session?.userDataDir) {
    throw anonErr;
  }

  const sessionChecker = session.hasSession ?? hasDouyinSession;
  const sessionStatus = await sessionChecker(session.userDataDir);
  if (sessionStatus !== "authed") {
    throw anonErr;
  }

  // 3. 以持久化上下文重跑同一套多路径提取
  const runAuthed = async (): Promise<DouyinAwemeItem> => {
    if (options?.customAuthedExtractor) {
      return await options.customAuthedExtractor(urlOrId);
    }
    if (options?.customExtractor) {
      return await options.customExtractor(urlOrId, { isAuthed: true });
    }
    return await withPersistentBrowserContext(
      session.userDataDir,
      { ...options, isMobile: options?.isMobile ?? false },
      async (page) => {
        return await extractAwemeFromLivePage(page, urlOrId, timeout);
      }
    );
  };

  const [authedErr, authedItem] = await tryit(runAuthed)();
  if (authedErr || !authedItem) {
    if (authedErr instanceof DouyinExtractionError && anonErr instanceof DouyinExtractionError) {
      throw new DouyinExtractionError(
        authedErr.reason,
        `[PublicAweme] 登录态兜底提取仍失败: ${authedErr.message}`,
        {
          attempts: [...anonErr.attempts, ...authedErr.attempts],
          cause: authedErr,
        }
      );
    }
    throw authedErr ?? anonErr;
  }

  return {
    ...authedItem,
    source: "authed-session",
    confidence: "authed-session",
  };
}
