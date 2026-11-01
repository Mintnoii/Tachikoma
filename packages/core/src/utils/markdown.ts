import matter from "gray-matter";
import { readFile } from "node:fs/promises";
import { resolve } from "pathe";
import { sift, unique } from "radash";

export interface ParsedMarkdown<T = Record<string, any>> {
  readonly data: Readonly<T>;
  readonly content: string;
  readonly body: string;
}

/**
 * 抹平换行符（CRLF -> LF）
 */
export const normalizeLf = (text: string): string => (text ?? "").replace(/\r\n/g, "\n");

/**
 * 纯内存同步解析 Markdown Frontmatter
 */
export const parseMarkdown = <T = Record<string, any>>(
  rawMarkdown: string
): Readonly<ParsedMarkdown<T>> => {
  const normalized = normalizeLf(rawMarkdown);
  const parsed = matter(normalized);

  return Object.freeze({
    data: Object.freeze({ ...(parsed.data as T) }),
    content: parsed.content,
    body: parsed.content.trim(),
  });
};

/**
 * 异步读取并解析指定路径的 Markdown 文件
 */
export async function readMarkdownFile<T = Record<string, any>>(
  ...pathSegments: string[]
): Promise<Readonly<ParsedMarkdown<T>>> {
  const fullPath = resolve(...pathSegments);
  const raw = await readFile(fullPath, "utf-8");
  return parseMarkdown<T>(raw);
}

/**
 * 提取文本中的所有 [[Wikilink]] 引用实体名
 * 1. 过滤代码块 (```) 与行内代码 (`) 内的伪链接
 * 2. 剥离别名 (|) 与章节锚点 (#)
 * 3. 过滤去重
 */
export const extractWikilinks = (content: string): readonly string[] => {
  const clean = (content ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "")
    .replace(/\\\|/g, "|");

  const rawMatches = clean.match(/\[\[.+?\]\]/g) ?? [];
  return unique(
    sift(
      rawMatches.map((token) => {
        const target = token.slice(2, -2).split(/[|#]/)[0]?.trim();
        return target && !target.startsWith("wiki/") ? target : null;
      })
    )
  );
};
