import { IngestionResult, persistIngestionResult, loadGhostTombstones, isTombstoneIgnored } from "@tachikoma/core";
import { sift } from "radash";
import { fetchHtml } from "./fetcher.js";
import { purifyArticle } from "./purifier.js";
import { WebClipperOptions } from "./types.js";

/**
 * 纯函数原子管道：剪藏单个网页/推文并落盘至 Ghost/_raw/articles/ (或沙盒目录)
 * 流式处理契约：url -> 墓碑防重校验 -> fetchHtml() -> purifyArticle() -> formatToRFC2026Markdown() -> persistIngestionResult()
 */
export async function clipUrl(
  url: string,
  options: WebClipperOptions
): Promise<{ result: IngestionResult; filePath: string; sha256: string }> {
  // 1. 优先校验 Ghost 墓碑账本，已被放弃炼化的内容直接阻断，避免重复抓取
  const tombstones = loadGhostTombstones(options.outputDir);
  if (isTombstoneIgnored({ url }, tombstones)) {
    throw new Error(`[墓碑拦截 Tombstone Blocked] 该 URL 已在 Ghost 墓碑账本中标记放弃炼化: ${url}`);
  }

  const { html, finalUrl } = await fetchHtml(url, options);
  if (finalUrl !== url && isTombstoneIgnored({ url: finalUrl }, tombstones)) {
    throw new Error(`[墓碑拦截 Tombstone Blocked] 重定向目标已在 Ghost 墓碑账本中标记放弃炼化: ${finalUrl}`);
  }

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
