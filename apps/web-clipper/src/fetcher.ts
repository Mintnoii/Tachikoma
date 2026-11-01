import { tryit } from "radash";
import { withBrowserPage, DEFAULT_DESKTOP_USER_AGENT } from "@tachikoma/core";
import { WebClipperOptions } from "./types.js";

/**
 * 零焦点后台无头浏览器渲染抓取原子函数
 */
export async function fetchWithBrowser(
  url: string,
  options: Partial<WebClipperOptions> = {}
): Promise<{ html: string; finalUrl: string }> {
  return await withBrowserPage(options, async (page) => {
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
  });
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
      "User-Agent": DEFAULT_DESKTOP_USER_AGENT,
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
