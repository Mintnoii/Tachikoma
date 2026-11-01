import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { extname } from "pathe";
import { tryit, unique } from "radash";
import { CreateSparkInput, SparkRecord } from "../schema.js";
import { createSpark } from "../db/sparks.js";
import { RefineSparkOptions, SparkLLMOptions } from "./types.js";
import {
  detectInputKind,
  extractUrlMetadata,
  processLocalAsset,
  distillText,
  fallbackExtractTitle,
} from "./extractor.js";
import { transcribeImageWithLLM } from "./llm.js";

const IMAGE_MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

/**
 * 依据扩展名映射常见图片 MIME，未知扩展名按 image/jpeg 兜底
 */
export function getMimeTypeFromExt(ext: string): string {
  const normalized = ext.toLowerCase();
  return IMAGE_MIME_MAP[normalized] ?? "image/jpeg";
}

/**
 * 模块级私有函数：将本地图片读取为 Data URL 并调用视觉转录
 */
async function transcribeLocalImage(
  assetPath: string,
  llmOptions: SparkLLMOptions,
  options?: RefineSparkOptions
): Promise<string> {
  const [readErr, buffer] = tryit(readFileSync)(assetPath);
  if (readErr || !buffer) {
    return "";
  }

  const ext = extname(assetPath);
  const mime = getMimeTypeFromExt(ext);
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

  const transcriber =
    options?.imageTranscriber ??
    ((url: string) => transcribeImageWithLLM(url, llmOptions));

  const [transcribeErr, result] = await tryit(transcriber)(dataUrl);
  if (transcribeErr || typeof result !== "string" || !result.trim()) {
    return "";
  }

  return result.trim();
}

/**
 * 将任意原始输入提纯为强契约 CreateSparkInput
 */
export async function refineSparkInput(
  rawInput: string,
  options?: RefineSparkOptions
): Promise<CreateSparkInput> {
  const kind = detectInputKind(rawInput);
  const userTags = options?.tags ?? [];
  const llmOptions: SparkLLMOptions = {
    ...options?.llmOptions,
    customFetcher:
      options?.llmOptions?.customFetcher ?? (options?.fetchFn as any),
    timeoutMs: options?.timeoutMs ?? options?.llmOptions?.timeoutMs,
  };

  if (kind === "url") {
    const meta = await extractUrlMetadata(
      rawInput,
      options?.fetchFn,
      options?.timeoutMs
    );
    const defaultCluster = meta.type === "tool" ? "arsenal" : undefined;
    return {
      type: options?.type ?? meta.type,
      title: options?.title ?? meta.title,
      content: meta.description || rawInput,
      sourceUrl: meta.sourceUrl,
      tags: unique([...meta.tags, ...userTags]),
      cluster: options?.cluster ?? defaultCluster,
      status: "seed",
    };
  }

  if (kind === "image" || kind === "file") {
    const asset = await processLocalAsset(
      rawInput,
      options?.assetsDir ?? ".sparks/assets"
    );
    const defaultType = asset.isImage ? "meme" : "fleeting";
    const baseNameSansExt = asset.fileName.replace(/\.[^/.]+$/, "");
    const defaultTitle = asset.isImage
      ? `梗图: ${baseNameSansExt}`
      : asset.fileName;
    const defaultTags = asset.isImage ? ["#梗图"] : ["#资产"];

    const transcribed = asset.isImage
      ? await transcribeLocalImage(asset.assetPath, llmOptions, options)
      : "";

    if (transcribed) {
      return {
        type: options?.type ?? defaultType,
        title: options?.title ?? fallbackExtractTitle(transcribed),
        content: transcribed,
        assetPath: asset.assetPath,
        tags: unique([...defaultTags, ...userTags]),
        cluster: options?.cluster,
        status: "seed",
      };
    }

    return {
      type: options?.type ?? defaultType,
      title: options?.title ?? defaultTitle,
      content: options?.title
        ? `${options.title} (${asset.fileName})`
        : asset.fileName,
      assetPath: asset.assetPath,
      tags: unique([...defaultTags, ...userTags]),
      cluster: options?.cluster,
      status: "seed",
    };
  }

  // 纯文本形态：优先调用 LLM 语义提纯
  const distilled = await distillText(rawInput, {
    userType: options?.type,
    cluster: options?.cluster,
    tags: userTags,
    llmOptions,
    skipLlm: options?.skipLlm,
  });

  return {
    type: options?.type ?? distilled.type,
    title: options?.title ?? distilled.title,
    content: distilled.content,
    tags: unique([...distilled.tags, ...userTags]),
    cluster: options?.cluster ?? distilled.cluster,
    status: "seed",
  };
}

/**
 * 战术灵感全自动提纯与持久化管道核心门面
 */
export async function refineAndCreateSpark(
  db: DatabaseSync,
  rawInput: string,
  options?: RefineSparkOptions
): Promise<SparkRecord> {
  const input = await refineSparkInput(rawInput, options);
  return createSpark(db, input);
}
