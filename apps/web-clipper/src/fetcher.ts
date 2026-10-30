import { chromium, type BrowserContext } from "playwright-core";
import { tryit } from "radash";
import { WebClipperOptions } from "./types.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

/**
 * 零焦点后台无头浏览器渲染抓取原子函数
 */
export async function fetchWithBrowser(
  url: string,
  options: Partial<WebClipperOptions> = {}
): Promise<{ html: string; finalUrl: string }> {
  let browserContext: BrowserContext | null = null;
  let ownBrowser = false;

  if (options.cdpEndpoint) {
    const browser = await chromium.connectOverCDP(options.cdpEndpoint);
    browserContext = browser.contexts()[0] ?? (await browser.newContext());
  } else {
    const browser = await chromium.launch({
      headless: options.headless ?? true,
      args: ["--no-startup-window", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    browserContext = await browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
      viewport: { width: 1280, height: 800 },
    });
    ownBrowser = true;
  }

  const page = await browserContext.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs || 30000,
    });

    // 微信推文懒加载图片属性处理 (data-src -> src)
    await page.evaluate(() => {
      document.querySelectorAll("img[data-src]").forEach((img) => {
        const dataSrc = img.getAttribute("data-src");
        if (dataSrc) img.setAttribute("src", dataSrc);
      });
    });

    const html = await page.content();
    const finalUrl = page.url();
    return { html, finalUrl };
  } finally {
    await tryit(page.close.bind(page))();
    if (ownBrowser && browserContext) {
      await tryit(browserContext.close.bind(browserContext))();
    }
  }
}

/**
 * 抓取网页原始 HTML（优先轻量 HTTP，必要时升级为零焦点无头 CDP 渲染）原子函数
 */
export async function fetchHtml(
  url: string,
  options: Partial<WebClipperOptions> = {}
): Promise<{ html: string; finalUrl: string }> {
  if (options.customFetcher) {
    return await options.customFetcher(url);
  }

  // 1. 尝试直接使用快速轻量 HTTP 提取（微信公众号文章等首屏已直出完整 DOM）
  const [fetchErr, httpRes] = await tryit(fetch)(url, {
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(options.timeoutMs || 15000),
    redirect: "follow",
  });

  if (!fetchErr && httpRes?.ok) {
    const [textErr, html] = await tryit(httpRes.text.bind(httpRes))();
    // 简单探测是否为有效文章页面（若内容极其简短或包含反爬验证码，则走 CDP）
    if (
      !textErr &&
      html &&
      html.length > 2000 &&
      !html.includes("安全验证") &&
      !html.includes("sec.douyin.com")
    ) {
      return { html, finalUrl: httpRes.url || url };
    }
  }

  // 2. 升级为 Playwright / CDP 零焦点浏览器渲染
  return await fetchWithBrowser(url, options);
}
