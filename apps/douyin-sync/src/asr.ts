import { tryit } from "radash";
import { resolve, basename } from "pathe";
import { existsSync, readFileSync } from "node:fs";
import { Static, Type } from "@sinclair/typebox";

export const AudioTranscribeOptionsSchema = Type.Object({
  baseUrl: Type.Optional(Type.String()),
  apiKey: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  language: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
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
    "http://127.0.0.1:3425/v1"
  ).replace(/\/+$/, "");

  const apiKey =
    options?.apiKey ??
    process.env.TACHIKOMA_ASR_API_KEY ??
    process.env.OPENAI_API_KEY ??
    "EMPTY";

  const model =
    options?.model ??
    process.env.TACHIKOMA_ASR_MODEL ??
    "whisper-1";

  const language =
    options?.language ??
    process.env.TACHIKOMA_ASR_LANGUAGE ??
    "zh";

  const timeoutMs = options?.timeoutMs ?? 30000;
  const fetcher = options?.customFetcher ?? fetch;

  return async (mediaSource: string): Promise<string | undefined> => {
    if (!mediaSource) return undefined;

    const [err, transcript] = await tryit(async () => {
      // 1. 准备音频/视频文件或 URL (区分本地绝对/相对路径与网络 URL)
      let fileBuffer: Buffer | null = null;
      let fileName = "audio.mp4";

      const isRemoteUrl = /^https?:\/\//i.test(mediaSource);
      if (isRemoteUrl) {
        // 远程音视频 URL，通过原生 fetch 流式拉取
        const resp = await fetcher(mediaSource, { signal: AbortSignal.timeout(timeoutMs) });
        if (!resp.ok) {
          throw new Error(`下载音视频源失败: HTTP ${resp.status}`);
        }
        const ab = await resp.arrayBuffer();
        fileBuffer = Buffer.from(ab);
        const urlObj = new URL(mediaSource);
        fileName = basename(urlObj.pathname) || "remote-audio.mp4";
      } else {
        const localPath = resolve(mediaSource);
        if (existsSync(localPath)) {
          fileBuffer = readFileSync(localPath);
          fileName = basename(localPath);
        }
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return undefined;
      }

      // 2. 构造符合 OpenAI Audio Transcription 规范的 Multipart FormData
      const formData = new FormData();
      const uint8 = new Uint8Array(fileBuffer);
      const blob = new Blob([uint8], { type: "application/octet-stream" });
      formData.append("file", blob, fileName);
      formData.append("model", model);
      formData.append("language", language);
      formData.append("response_format", "json");

      const endpoint = `${baseUrl}/audio/transcriptions`;
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`ASR API 请求失败 [HTTP ${response.status}]: ${text}`);
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
