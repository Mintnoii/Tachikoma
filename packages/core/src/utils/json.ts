import { jsonrepair } from "jsonrepair";
import { tryit } from "radash";

/**
 * 通用容错安全 JSON 解析器
 * 依托 jsonrepair 与 radash.tryit 自愈非标/残缺 JSON（单引号、末尾逗号、未闭合大括号等），
 * 绝不向外抛出未捕获异常，解析失败时优雅降级为 fallback
 */
export function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) {
    return fallback;
  }
  const trimmed = raw.trim();

  // 1. 优先尝试原生标准解析
  const [nativeErr, nativeParsed] = tryit((str: string) => JSON.parse(str) as T)(trimmed) as [
    Error | undefined,
    T | undefined,
  ];
  if (!nativeErr && nativeParsed !== undefined) {
    return nativeParsed;
  }

  // 2. 原生失败时，依托 jsonrepair 自愈非标 JSON 并重新解析
  const [repairErr, repairedParsed] = tryit((str: string) => {
    const repaired = jsonrepair(str);
    return JSON.parse(repaired) as T;
  })(trimmed) as [Error | undefined, T | undefined];

  if (!repairErr && repairedParsed !== undefined) {
    return repairedParsed;
  }

  return fallback;
}
