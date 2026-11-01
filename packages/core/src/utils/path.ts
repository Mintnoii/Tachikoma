import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from "pathe";

/**
 * 规范化为 POSIX 风格相对/绝对路径（抹平 Windows 反斜杠）
 */
export const toPosixPath = (p: string): string => normalize(p).replace(/\\/g, "/");

/**
 * 提取文件名去后缀（例如 "wiki/learning/IPO.md" -> "IPO"）
 */
export const extractStem = (p: string, ext = ".md"): string => basename(p, ext);

/**
 * 提取上级目录名（例如 "wiki/areas/ai-agent/_index.md" -> "ai-agent"）
 */
export const extractParentDir = (p: string): string => basename(dirname(p));

/**
 * 判断 child 是否位于 parent 目录下
 */
export const isSubPath = (parent: string, child: string): boolean => {
  const rel = relative(parent, child);
  return !rel.startsWith("..") && !isAbsolute(rel);
};

export { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve };
