import { tryit, unique } from "radash";
import { resolve, basename, dirname } from "pathe";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import YAML from "yaml";
import { Static, Type } from "@sinclair/typebox";
import { resolveWorkspaceRoot } from "@tachikoma/core";
import { DOUYIN_CDN_HEADERS } from "./cdn.js";
import { toWhisperWav } from "./media.js";

export const KNOWN_WHISPER_SIZES = [
  "tiny.en",
  "tiny",
  "base.en",
  "base",
  "small.en",
  "small",
  "medium.en",
  "medium",
  "large-v3",
  "large-v2",
  "large-v1",
  "large",
  "turbo",
] as const;

/**
 * 容错解析模型名称为本地尺寸（如 whisper-medium / medium -> medium），非法值回退默认尺寸
 */
export function resolveWhisperModelSize(
  rawModel?: string,
  fallback = "medium"
): string {
  if (!rawModel || !rawModel.trim()) return fallback;
  const normalized = rawModel.trim().toLowerCase();
  const stripped = normalized
    .replace(/^openai\/whisper-/, "")
    .replace(/^whisper-/, "");

  const exact = KNOWN_WHISPER_SIZES.find((s) => s === stripped);
  if (exact) return exact;

  const partial = KNOWN_WHISPER_SIZES.find((s) => normalized.includes(s));
  if (partial) return partial;

  return fallback;
}

export const AsrGlossaryEntrySchema = Type.Object({
  wrong: Type.Optional(Type.String()),
  wrong_variants: Type.Optional(Type.Array(Type.String())),
  correct: Type.String(),
  status: Type.String(),
  source: Type.Optional(Type.String()),
  context: Type.Optional(Type.String()),
});

export type AsrGlossaryEntry = Static<typeof AsrGlossaryEntrySchema>;

export const AsrGlossaryFileSchema = Type.Object({
  entries: Type.Optional(Type.Array(AsrGlossaryEntrySchema)),
});

export type AsrGlossaryFile = Static<typeof AsrGlossaryFileSchema>;

/**
 * 将错词表 entries 转为 initial_prompt 专名拼接串：
 * 1. 过滤仅保留 status: verified 且 correct 非空的条目
 * 2. correct 去重（大小写不敏感，保留首个出现的大小写）
 * 3. 截断至 maxTerms（默认 64 条）
 * 4. 逗号拼接
 */
export function buildAsrPromptFromEntries(
  entries: readonly unknown[],
  maxTerms = 64
): string {
  const verified = entries
    .filter((e): e is { correct: string; status: string } => {
      return (
        typeof e === "object" &&
        e !== null &&
        "status" in e &&
        (e as { status: unknown }).status === "verified" &&
        "correct" in e &&
        typeof (e as { correct: unknown }).correct === "string"
      );
    })
    .map((e) => e.correct.trim())
    .filter(Boolean);

  const deduplicated = unique(verified, (term) => term.toLowerCase());
  const sliced = deduplicated.slice(0, Math.max(0, maxTerms));
  return sliced.join(", ");
}

/**
 * 解析原始 YAML 内容并提取 verified 词条拼接 prompt
 */
export function buildAsrPromptFromYaml(
  yamlContent: string,
  maxTerms = 64
): string {
  const [err, parsed] = tryit((): unknown => YAML.parse(yamlContent))();
  if (err || typeof parsed !== "object" || parsed === null) {
    return "";
  }
  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    return "";
  }
  return buildAsrPromptFromEntries(entries, maxTerms);
}

/**
 * 自适应定位默认错词表路径 (apps/douyin-sync/config/asr_glossary.yaml)
 */
export function resolveDefaultGlossaryPath(): string {
  const workspaceRoot = resolveWorkspaceRoot();
  const workspaceGlossary = resolve(
    workspaceRoot,
    "apps/douyin-sync/config/asr_glossary.yaml"
  );
  if (existsSync(workspaceGlossary)) {
    return workspaceGlossary;
  }
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, "../config/asr_glossary.yaml");
}

/**
 * 加载并构建 ASR initial_prompt 词表串。文件缺失或解析失败一律静默降级为空字符串
 */
export function loadAsrGlossaryPrompt(
  glossaryPath?: string,
  maxTerms = 64
): string {
  const [err, prompt] = tryit(() => {
    const targetPath = glossaryPath ?? resolveDefaultGlossaryPath();
    if (!existsSync(targetPath)) {
      return "";
    }
    const content = readFileSync(targetPath, "utf-8");
    return buildAsrPromptFromYaml(content, maxTerms);
  })();

  if (err) {
    return "";
  }
  return prompt ?? "";
}

export const AudioTranscribeOptionsSchema = Type.Object({
  baseUrl: Type.Optional(Type.String()),
  apiKey: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  language: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
  prompt: Type.Optional(Type.String()),
  glossaryPath: Type.Optional(Type.String()),
  /** 覆盖默认 ffmpeg 转码（测试注入用）：入参原始字节与文件名，返回 WAV 字节 */
  customTranscoder: Type.Optional(Type.Any()),
});

export type AudioTranscribeOptions = Static<typeof AudioTranscribeOptionsSchema> & {
  customFetcher?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

export type AudioTranscriber = (mediaSource: string) => Promise<string | undefined>;

/**
 * 创建基于标准 OpenAI Audio Transcription API (POST /v1/audio/transcriptions) 的纯 TypeScript 原生语音转录器。
 * 支持：
 * - 本地部署的 Whisper (Whisper.cpp / Faster-Whisper / LocalAI / Ollama / Magpie)
 * - 远端兼容的 OpenAI Audio API 端点
 * - 通过 FormData 直出，通过 radash.tryit 实现平滑降级，绝不因 ASR 挂掉崩断采集
 */
export function createAudioTranscriber(options?: AudioTranscribeOptions): AudioTranscriber {
  const baseUrl = (
    options?.baseUrl ??
    process.env.TACHIKOMA_ASR_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    "http://127.0.0.1:8000/v1"
  ).replace(/\/+$/, "");

  const apiKey =
    options?.apiKey ??
    process.env.TACHIKOMA_ASR_API_KEY ??
    process.env.OPENAI_API_KEY ??
    "EMPTY";

  const model =
    options?.model ??
    process.env.TACHIKOMA_ASR_MODEL ??
    "whisper-medium";

  const language =
    options?.language ??
    process.env.TACHIKOMA_ASR_LANGUAGE ??
    "zh";

  const downloadTimeoutMs =
    options?.timeoutMs ??
    Number(process.env.TACHIKOMA_ASR_DOWNLOAD_TIMEOUT_MS ?? 60000);

  // CPU 推理是慢路径：medium 模型对 1~3 分钟视频需要数十秒到数分钟，必须给足
  const transcribeTimeoutMs = Number(
    process.env.TACHIKOMA_ASR_TIMEOUT_MS ?? 600000
  );
  const fetcher = options?.customFetcher ?? fetch;
  const transcode = options?.customTranscoder ?? toWhisperWav;
  const prompt = options?.prompt ?? loadAsrGlossaryPrompt(options?.glossaryPath);

  return async (mediaSource: string): Promise<string | undefined> => {
    if (!mediaSource) return undefined;

    const [err, transcript] = await tryit(async () => {
      // 1. 准备音频/视频文件或 URL (区分本地绝对/相对路径与网络 URL)
      const isRemoteUrl = /^https?:\/\//i.test(mediaSource);
      const { fileBuffer, fileName } = isRemoteUrl
        ? await (async () => {
            const resp = await fetcher(mediaSource, {
              signal: AbortSignal.timeout(downloadTimeoutMs),
              headers: DOUYIN_CDN_HEADERS,
            });
            if (!resp.ok) {
              throw new Error(`下载音视频源失败: HTTP ${resp.status}`);
            }
            const ab = await resp.arrayBuffer();
            const urlObj = new URL(mediaSource);
            return {
              fileBuffer: Buffer.from(ab),
              fileName: basename(urlObj.pathname) || "remote-audio.mp4",
            };
          })()
        : (() => {
            const localPath = resolve(mediaSource);
            return existsSync(localPath)
              ? {
                  fileBuffer: readFileSync(localPath),
                  fileName: basename(localPath),
                }
              : { fileBuffer: null, fileName: "audio.mp4" };
          })();

      if (!fileBuffer || fileBuffer.length === 0) {
        return undefined;
      }

      // 1.5 whisper-server 只吃 WAV：其它格式先本地转 16k 单声道
      const wavBuffer = await transcode(fileBuffer, fileName);

      // 2. 构造符合 OpenAI Audio Transcription 规范的 Multipart FormData
      const formData = new FormData();
      const uint8 = new Uint8Array(wavBuffer);
      const blob = new Blob([uint8], { type: "audio/wav" });
      formData.append("file", blob, "audio.wav");
      formData.append("model", model);
      formData.append("language", language);
      formData.append("response_format", "json");
      if (prompt) {
        formData.append("prompt", prompt);
      }

      const endpoint = `${baseUrl}/audio/transcriptions`;
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(transcribeTimeoutMs),
      });

      if (!response.ok) {
        const text = await response.text();
        const snippet = text.slice(0, 200);
        throw new Error(`ASR API 请求失败 [HTTP ${response.status}]: ${snippet}`);
      }

      const data = (await response.json()) as { text?: string };
      return data?.text?.trim() || undefined;
    })();

    if (err) {
      // ASR 失败时进行安静容错提示，返回 undefined 触发上层降级至作者文案
      console.warn(`[Tachikoma ASR] 语音转录跳过/降级: ${err.message}`);
      return undefined;
    }

    return transcript;
  };
}
