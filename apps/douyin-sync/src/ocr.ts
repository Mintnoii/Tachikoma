import { readFile } from "node:fs/promises";
import { extname } from "pathe";
import { tryit } from "radash";
import { toPosixPath } from "@tachikoma/core";

export interface MagpieOCROptions {
  baseUrl?: string; // 默认 http://127.0.0.1:3425/v1
  apiKey?: string; // 默认 magpie
  model?: string; // 默认 auto/gemini-3.8-flash
  timeoutMs?: number;
  customFetcher?: (url: string, init?: RequestInit) => Promise<Response>; // 测试沙盒注入
}

const OCR_PROMPT =
  "请完整提取并识别这张图片中的所有文字内容，原样转录输出，不要遗漏、不要总结、不要解释。若画面中无文字，请输出【无文字】。";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export const getMimeType = (filePathOrUrl: string): string => {
  const clean = filePathOrUrl.split("?")[0] ?? "";
  const ext = extname(clean).toLowerCase();
  return MIME_MAP[ext] ?? "image/jpeg";
};

/**
 * 将图片（本地路径或网络 URL）解析转换为 Base64 Data URL
 */
export async function resolveImageDataUrl(
  imagePathOrUrl: string,
  options: MagpieOCROptions = {}
): Promise<string> {
  const isRemote = /^https?:\/\//i.test(imagePathOrUrl);
  const activeFetcher: typeof fetch = (options.customFetcher as any) ?? globalThis.fetch;

  if (isRemote) {
    const [err, res] = await tryit(activeFetcher)(imagePathOrUrl);
    if (err || !res?.ok) {
      throw new Error(`下载网络图片失败 (${res?.status}): ${imagePathOrUrl}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || getMimeType(imagePathOrUrl);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }

  const [readErr, buffer] = await tryit(readFile)(toPosixPath(imagePathOrUrl));
  if (readErr || !buffer) {
    throw new Error(`读取本地图片失败: ${imagePathOrUrl} - ${readErr?.message}`);
  }
  const mime = getMimeType(imagePathOrUrl);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * 单张图片 OCR 转录原子函数
 */
export async function ocrImage(
  urlOrPath: string,
  options: MagpieOCROptions = {}
): Promise<string> {
  const baseUrl = (
    options.baseUrl ||
    process.env.MAGPIE_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "http://127.0.0.1:3425/v1"
  ).replace(/\/+$/, "");
  const apiKey =
    options.apiKey ||
    process.env.MAGPIE_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "magpie";
  const model =
    options.model ||
    process.env.MAGPIE_VISION_MODEL ||
    process.env.OPENAI_VISION_MODEL ||
    "auto/gemini-3.8-flash";
  const timeoutMs = options.timeoutMs || 60000;
  const activeFetcher: typeof fetch = (options.customFetcher as any) ?? globalThis.fetch;

  const dataUrl = await resolveImageDataUrl(urlOrPath, options);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const endpoint = `${baseUrl}/chat/completions`;
  const payload = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0.1,
  };

  const [err, res] = await tryit(activeFetcher)(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  clearTimeout(timer);

  if (err) {
    throw new Error(`[Magpie OCR] 请求模型失败: ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[Magpie OCR] API 返回错误 (${res.status}): ${text}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return content.trim();
}

/**
 * 批量转录多张图集并生成聚合 Markdown 正文（纯函数式链式映射，杜绝命令式 for 游标循环）
 */
export async function ocrGallery(
  images: string[],
  options: MagpieOCROptions = {}
): Promise<string> {
  if (!images.length) {
    return "（空图集，无图片资源）";
  }

  const sections = await Promise.all(
    images.map(async (img, idx) => {
      const pageIndex = idx + 1;
      const [err, text] = await tryit(ocrImage)(img, options);
      const content = err ? `> ⚠️ OCR 识别异常: ${err.message}` : (text || "【无文字】");
      return `### 第 ${pageIndex} 张 / 共 ${images.length} 张\n\n${content}`;
    })
  );

  return sections.join("\n\n").trim();
}
