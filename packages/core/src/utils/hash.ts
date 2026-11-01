import { createHash } from "node:crypto";
import { normalizeLf } from "./markdown.js";

/**
 * 计算纯净文本内容的 SHA-256 哈希值
 * 强制先行抹平换行符为 LF，杜绝因 CRLF / LF 差异引发的伪哈希冲突
 */
export const computeContentHash = (content: string): string => {
  return createHash("sha256").update(normalizeLf(content), "utf8").digest("hex");
};
