import { IngestionResult, persistIngestionResult } from "@tachikoma/core";
import { sift } from "radash";
import { fetchHtml } from "./fetcher.js";
import { purifyArticle } from "./purifier.js";
import { WebClipperOptions } from "./types.js";

/**
 * 纯函数原子管道：剪藏单个网页/推文并落盘至 Ghost/_raw/articles/ (或沙盒目录)
 * 流式处理契约：url -> fetchHtml() -> purifyArticle() -> formatToRFC2026Markdown() -> persistIngestionResult()
 */
export async function clipUrl(
  url: string,
  options: WebClipperOptions
): Promise<{ result: IngestionResult; filePath: string; sha256: string }> {
  const { html, finalUrl } = await fetchHtml(url, options);
  const purified = purifyArticle(html, finalUrl);

  const authorName = purified.byline || purified.siteName || "网络信源";
  const bodyContent = sift([
    `# ${purified.title}`,
    "",
    `> 来源/作者: ${authorName}`,
    `> 原始链接: ${finalUrl}`,
    purified.siteName ? `> 站点标识: ${purified.siteName}` : null,
    "",
    purified.content,
  ]).join("\n");

  const result: IngestionResult = {
    sourceUrl: finalUrl,
    mediaType: purified.mediaType,
    title: purified.title,
    author: {
      name: authorName,
      url: finalUrl,
    },
    content: bodyContent,
    metadata: {
      siteName: purified.siteName,
      excerpt: purified.excerpt,
      lang: purified.lang,
    },
    createdAt: new Date().toISOString(),
  };

  const { filePath, sha256 } = await persistIngestionResult(
    result,
    options.outputDir,
    "articles"
  );

  return { result, filePath, sha256 };
}
