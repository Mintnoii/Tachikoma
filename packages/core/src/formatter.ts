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

const stripTrailingDotsAndSpaces = (val: string): string =>
  val.replace(/[.\s]+$/, "");

const stripTrailingMd = (val: string): string => {
  const cleaned = stripTrailingDotsAndSpaces(val);
  const withoutMd = cleaned.replace(/\.md$/i, "");
  return withoutMd === cleaned ? cleaned : stripTrailingMd(withoutMd);
};

/**
 * 将任意标题规范化为安全的文件名主干（不含扩展名）
 *
 * 规范化规则：
 * 1. 替换 Windows/Unix 非法字符 [\\/:*?"<>|] 为下划线 "_"
 * 2. 剥掉结尾的 "." 与空格（可递归清洗）
 * 3. 剥掉结尾一层或多层 ".md"（大小写不敏感，如 .MD、.md.md），剥完后再次清理结尾 "." 和空格
 * 4. 截断至 80 字符，并在截断后再次清理末尾残留的 "." 与空格
 * 5. 若清洗后为空字符串，则安全回退为 "untitled"
 *
 * @example
 * // 1. 标题以 .md 结尾：剥除末尾 .md，避免文件名生成为 .md.md 导致 Ghost wikilink 断链
 * toSafeFileTitle("JetBrains 开源 ThinkRail：给 pi Agent 配 worktree 和活的 SPEC.md")
 * // => "JetBrains 开源 ThinkRail：给 pi Agent 配 worktree 和活的 SPEC"
 *
 * @example
 * // 2. 标题以点或空格结尾：剥除末尾非法字符，避免 Windows 文件系统非法命名
 * toSafeFileTitle("Save As...")
 * // => "Save As"
 *
 * @example
 * // 3. 超长标题：截断至 80 字符并清理截断边界残留的符号与空白
 * toSafeFileTitle("Building a Super Intelligent Autonomous Multi-Agent Framework from Scratch with TypeScript and Rust: Architectural Patterns, Lessons Learned, and Best Practices")
 * // => "Building a Super Intelligent Autonomous Multi-Agent Framework from Scratch with"
 *
 * @param title 原始输入标题
 * @returns 规范化的安全文件名主干（不含扩展名）
 */
export function toSafeFileTitle(title?: string | null): string {
  const sanitized = (title || "").replace(/[\\/:*?"<>|]/g, "_").trim();
  const withoutMd = stripTrailingMd(sanitized);
  const truncated = withoutMd.slice(0, 80);
  const cleaned = stripTrailingMd(truncated);
  return cleaned || "untitled";
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

  const fileName = `${toSafeFileTitle(result.title)}.md`;
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
