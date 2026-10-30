import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { sift, tryit } from "radash";
import { MediaType } from "@tachikoma/core";
import { MetaDescriptionResult, PurifiedArticle } from "./types.js";

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
 * 清除节点中的行内隐藏样式（如 visibility: hidden、opacity: 0），避免 Readability 误判剔除
 */
export const cleanHiddenStyles = (el: Element): void => {
  const style = el.getAttribute("style");
  if (!style) return;
  const cleaned = style
    .replace(/visibility\s*:\s*hidden(?:\s*!important)?\s*;?/gi, "")
    .replace(/opacity\s*:\s*0(?:\.0*)?(?:\s*!important)?\s*;?/gi, "")
    .replace(/display\s*:\s*none(?:\s*!important)?\s*;?/gi, "")
    .trim();
  if (cleaned) {
    el.setAttribute("style", cleaned);
  } else {
    el.removeAttribute("style");
  }
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
 * 纯函数：将 HTML 字符串转换为 Document 实例
 */
export const parseHtmlToDoc = (html: string, url?: string): Document => {
  return new JSDOM(html, { url }).window.document;
};

/**
 * 纯函数：解码 HTML 实体与特殊转义（还原 \x0a / \n 换行，还原 \x26lt; &lt; 等实体）
 */
export const decodeEntitiesAndEscapes = (raw: string, doc?: Document): string => {
  if (!raw) return "";

  // 1. 还原 \x.. 16 进制编码（如 \x0a -> \n, \x26 -> &）
  let s = raw.replace(/\\x([0-9a-fA-F]{2})/gi, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  // 2. 还原字面量转义 \r\n, \n, \r
  s = s.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");

  // 3. 解码 HTML 实体（通过 DOM textarea 纯文本反转义）
  const documentInstance = doc || new JSDOM().window.document;
  const textarea = documentInstance.createElement("textarea");
  textarea.innerHTML = s;
  let decoded = textarea.value;

  // 4. 若还残留多层 HTML 实体（如 \x26amp;lt; 解码后为 &lt;），做二次反转义
  if (/&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/.test(decoded)) {
    textarea.innerHTML = decoded;
    decoded = textarea.value;
  }

  return decoded;
};

/**
 * 纯函数：从 DOM 文档（或 HTML 字符串）的 meta 标签中提取并解码描述、作者候选与配图
 */
export const extractMetaDescription = (
  docOrHtml: Document | string
): MetaDescriptionResult | null => {
  const doc =
    typeof docOrHtml === "string" ? parseHtmlToDoc(docOrHtml) : docOrHtml;

  if (!doc?.querySelector) return null;

  // 1. 寻找 meta 描述候选（支持 description、og:description 等）
  const descCandidates = sift([
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim(),
    doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim(),
    doc.querySelector('meta[name="og:description"]')?.getAttribute("content")?.trim(),
    doc.querySelector('meta[property="twitter:description"]')?.getAttribute("content")?.trim(),
    doc.querySelector('meta[name="twitter:description"]')?.getAttribute("content")?.trim(),
  ]);

  if (descCandidates.length === 0) {
    return null;
  }

  // 挑选信息量最丰富（字符最长）的描述源
  const rawDesc = descCandidates.sort((a, b) => b.length - a.length)[0];
  if (!rawDesc) {
    return null;
  }

  // 2. 解码换行与 HTML 实体
  let decodedText = decodeEntitiesAndEscapes(rawDesc, doc).trim();

  // 3. 提取 og:image 候选并拼接到文末
  const imageCandidates = sift([
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim(),
    doc.querySelector('meta[name="og:image"]')?.getAttribute("content")?.trim(),
    doc.querySelector('meta[property="twitter:image"]')?.getAttribute("content")?.trim(),
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content")?.trim(),
  ]);
  const ogImage = imageCandidates[0];

  if (ogImage && !decodedText.includes(ogImage)) {
    decodedText = `${decodedText}\n\n![](${ogImage})`;
  }

  // 4. 提取 meta[name="author"] 或 og:site_name 作为作者候选
  const authorCandidates = sift([
    doc.querySelector('meta[name="author"]')?.getAttribute("content")?.trim(),
    doc.querySelector('meta[property="article:author"]')?.getAttribute("content")?.trim(),
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim(),
    doc.querySelector('meta[name="og:site_name"]')?.getAttribute("content")?.trim(),
  ]);
  const author = authorCandidates[0];

  return {
    content: decodedText,
    author: author || undefined,
    ogImage: ogImage || undefined,
  };
};

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
  doc.querySelectorAll("img").forEach((img) => {
    const dataSrc =
      img.getAttribute("data-src") ||
      img.getAttribute("data-original") ||
      img.getAttribute("data-actualsrc");
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

  // 3. 预处理微信公众号等特殊 DOM（清除 #js_content 隐藏样式，防止 Readability 误判剔除）
  const jsContent = doc.querySelector("#js_content");
  let jsContentHtml: string | undefined;

  if (jsContent) {
    cleanHiddenStyles(jsContent);
    jsContent.querySelectorAll("[style]").forEach(cleanHiddenStyles);
    jsContentHtml = jsContent.innerHTML.trim() || undefined;
  }

  // 4. 元数据与主体提取
  const titleOverride = doc.querySelector("#activity-name")?.textContent?.trim();
  const authorOverride = doc.querySelector("#js_name")?.textContent?.trim();

  const reader = new Readability(doc);
  const parsed = reader.parse();

  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
  const title = titleOverride || parsed?.title || ogTitle || doc.title || "未命名网页文章";

  const metaAuthor =
    doc.querySelector('meta[name="author"]')?.getAttribute("content")?.trim() ||
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim() ||
    doc.querySelector('meta[name="og:site_name"]')?.getAttribute("content")?.trim() ||
    undefined;

  let byline = authorOverride || parsed?.byline || metaAuthor || undefined;
  const siteName =
    parsed?.siteName ||
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim() ||
    undefined;

  // 若 Readability 抓取的正文过短（如长度 < 200）且 #js_content 存在，优先以 #js_content 作为提纯源
  const parsedTextLength = parsed?.textContent?.trim().length ?? 0;
  const isParsedTooShort = parsedTextLength < 200;

  const contentHtml =
    (isParsedTooShort && jsContentHtml ? jsContentHtml : undefined) ||
    parsed?.content ||
    jsContentHtml ||
    doc.body.innerHTML;

  const firstParagraph = jsContent?.querySelector("p")?.textContent?.trim();
  let excerpt =
    (!isParsedTooShort ? parsed?.excerpt : undefined) ||
    firstParagraph ||
    parsed?.excerpt ||
    undefined;

  // 5. 转译为 Markdown
  let markdown = defaultTurndown.turndown(contentHtml).replace(/\n{3,}/g, "\n\n").trim();

  // 6. 微信视频号/微动态短图文 meta 提取增强
  // 当正文过短（如被微信「扫码查看」占位符污染，字数 < 350 字符），自动检查 doc 中的 meta 描述
  if (markdown.length < 350 || markdown.includes("微信扫一扫可打开此内容")) {
    const metaData = extractMetaDescription(doc);
    if (
      metaData &&
      (metaData.content.length > 200 || metaData.content.length > markdown.length)
    ) {
      markdown = metaData.content;
      if (!byline && metaData.author) {
        byline = metaData.author;
      }
      if (!excerpt) {
        excerpt = metaData.content.split("\n")[0]?.trim();
      }
    }
  }

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

