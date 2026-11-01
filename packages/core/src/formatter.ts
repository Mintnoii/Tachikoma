import { toPosixPath, computeContentHash } from "./utils/index.js";
import matter from "gray-matter";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "pathe";
import { tryit } from "radash";
import { IngestionResult, RFC2026Frontmatter, EntryType } from "./types.js";

/**
 * 根据源 URL 与媒体类型确定物理摄入渠道 entry
 */
export function resolveEntry(sourceUrl: string, mediaType?: string): EntryType {
  const lowerUrl = (sourceUrl || "").toLowerCase();
  if (lowerUrl.includes("douyin.com") || lowerUrl.includes("iesdouyin.com")) {
    return "douyin-sync";
  }
  if (lowerUrl.includes("twitter.com") || lowerUrl.includes("x.com")) {
    return "twitter-clipper";
  }
  if (lowerUrl.includes("mp.weixin.qq.com")) {
    return "wechat-clipper";
  }
  if (mediaType === "video" || mediaType === "gallery") {
    return "douyin-sync";
  }
  if (mediaType === "tweet") {
    return "twitter-clipper";
  }
  return "wechat-clipper"; // 通用文章剪藏默认为 article/wechat-clipper 渠道规范
}

/**
 * 将 IngestionResult 序列化为符合 Ghost RFC-2026-0922 格式的标准 Markdown 字符串
 */
export function formatToRFC2026Markdown(result: IngestionResult): {
  markdown: string;
  sha256: string;
  frontmatter: RFC2026Frontmatter;
} {
  const sha256 = computeContentHash(result.content);
  const entry = result.entry || resolveEntry(result.sourceUrl, result.mediaType);

  const frontmatter: RFC2026Frontmatter = {
    title: result.title,
    entry,
    media_type: result.mediaType,
    source_url: result.sourceUrl,
    created_at: result.createdAt,
    tags: [entry, result.mediaType],
    author: result.author,
    sha256,
    extra: result.metadata,
  };

  // 递归剔除 undefined 键值，防止 js-yaml 解析抛出 unacceptable kind of an object to dump [object Undefined]
  const cleanFrontmatter = JSON.parse(JSON.stringify(frontmatter));
  const markdown = matter.stringify(result.content, cleanFrontmatter);
  return { markdown, sha256, frontmatter };
}

/**
 * 将摄入结果持久化至目标目录（沙盒或 Ghost/_raw/<category>/）
 */
export async function persistIngestionResult(
  result: IngestionResult,
  outputRootDir: string,
  category: string = "articles"
): Promise<{ filePath: string; sha256: string }> {
  const { markdown, sha256 } = formatToRFC2026Markdown(result);

  // 安全化文件名，去除非法字符
  const sanitizedTitle = result.title
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 80);
  const fileName = `${sanitizedTitle || "untitled"}.md`;
  const targetPath = toPosixPath(join(outputRootDir, category, fileName));

  const [mkdirErr] = await tryit(mkdir)(dirname(targetPath), { recursive: true });
  if (mkdirErr) {
    throw new Error(`创建落盘目录失败: ${dirname(targetPath)} - ${mkdirErr.message}`);
  }

  const [writeErr] = await tryit(writeFile)(targetPath, markdown, "utf-8");
  if (writeErr) {
    throw new Error(`写入摄入卡片失败: ${targetPath} - ${writeErr.message}`);
  }

  return { filePath: targetPath, sha256 };
}
