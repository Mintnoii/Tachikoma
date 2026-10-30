import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { sift, tryit } from "radash";
import { MediaType } from "@tachikoma/core";
import { PurifiedArticle } from "./types.js";

const UNWANTED_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "#js_sponsor_ad",
  "#js_pc_qr_code",
  "#js_read_area",
  ".qr_code_pc",
  ".reward_area",
  ".share_media",
  ".ad-banner",
  ".advertisement",
];

/**
 * 判断是否为推文链接（基于 URL 解析，杜绝手写天书正则）
 */
export const isTweetUrl = (rawUrl: string): boolean => {
  const [err, parsed] = tryit(() => new URL(rawUrl))();
  if (err || !parsed) return false;
  const host = parsed.hostname.toLowerCase();
  return host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com");
};

/**
 * 提取代码块语言标注
 */
export const extractCodeLang = (el: Element): string => {
  const codeEl = el.querySelector("code");
  const candidates = sift([
    codeEl?.getAttribute("data-lang"),
    el.getAttribute("data-lang"),
    codeEl?.className?.match(/(?:language-|lang-)(\w+)/)?.[1],
    el.className?.match(/(?:language-|lang-)(\w+)/)?.[1],
  ]);
  return candidates[0] ?? "";
};

/**
 * 创建针对正文提取与排版配置的 Turndown 实例
 */
export const createTurndownConverter = (): TurndownService => {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
  });

  service.addRule("fencedCodeBlockWithLang", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_content, node) => {
      const el = node as Element;
      const codeElement = el.querySelector("code");
      const lang = extractCodeLang(el);
      const codeText = (codeElement || el).textContent || "";
      return `\n\`\`\`${lang}\n${codeText.trim()}\n\`\`\`\n`;
    },
  });

  return service;
};

const defaultTurndown = createTurndownConverter();

/**
 * 纯函数：提纯 HTML 为结构化标准 Markdown 卡片内容
 */
export const purifyArticle = (html: string, url: string): PurifiedArticle => {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // 1. 函数式声明清洗 DOM
  UNWANTED_SELECTORS.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((el) => el.remove());
  });

  // 2. 规范化图片与代码标签
  doc.querySelectorAll("img[data-src]").forEach((img) => {
    const dataSrc = img.getAttribute("data-src");
    if (dataSrc) img.setAttribute("src", dataSrc);
  });

  doc.querySelectorAll("pre, code").forEach((el) => {
    const cls = el.getAttribute("class") || "";
    const match = cls.match(/(?:language-|lang-)(\w+)/);
    if (match) {
      el.setAttribute("data-lang", match[1]);
      if (el.parentElement?.tagName === "PRE") {
        el.parentElement.setAttribute("data-lang", match[1]);
      }
    }
  });

  // 3. 元数据与主体提取
  const titleOverride = doc.querySelector("#activity-name")?.textContent?.trim();
  const authorOverride = doc.querySelector("#js_name")?.textContent?.trim();

  const reader = new Readability(doc);
  const parsed = reader.parse();

  const title = titleOverride || parsed?.title || doc.title || "未命名网页文章";
  const byline = authorOverride || parsed?.byline || undefined;
  const siteName = parsed?.siteName || undefined;
  const excerpt = parsed?.excerpt || undefined;

  const contentHtml =
    parsed?.content ||
    doc.querySelector("#js_content")?.innerHTML ||
    doc.body.innerHTML;

  // 4. 转译为 Markdown
  const markdown = defaultTurndown.turndown(contentHtml).replace(/\n{3,}/g, "\n\n").trim();
  const mediaType: MediaType = isTweetUrl(url) ? "tweet" : "article";

  return {
    title: title.replace(/\s+/g, " ").trim(),
    byline: byline?.trim(),
    content: markdown,
    excerpt: excerpt?.trim(),
    siteName,
    lang: parsed?.lang || undefined,
    mediaType,
  };
};

