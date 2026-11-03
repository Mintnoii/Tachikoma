import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "pathe";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import {
  buildAsrPromptFromEntries,
  buildAsrPromptFromYaml,
  loadAsrGlossaryPrompt,
  resolveWhisperModelSize,
  createAudioTranscriber,
} from "@tachikoma/douyin-sync";

describe("Douyin ASR Prompt & Model Mapping Tests", () => {
  it("builds prompt only from verified entries and deduplicates case-insensitively", () => {
    const rawYaml = `
entries:
  - wrong: "窝巴里"
    correct: "WorkBuddy"
    status: verified
  - wrong: "窝巴里变体"
    correct: "workbuddy"
    status: verified
  - wrong: "翻派"
    correct: "ffmpeg"
    status: verified
  - wrong: "未知"
    correct: "PendingTool"
    status: pending
  - wrong: "空项"
    correct: ""
    status: verified
`;
    const prompt = buildAsrPromptFromYaml(rawYaml);
    assert.strictEqual(prompt, "WorkBuddy, ffmpeg");
  });

  it("filters out pending entries even when placed first", () => {
    const rawYaml = `
entries:
  - wrong: "待确认1"
    correct: "ToolA"
    status: pending
  - wrong: "已确认"
    correct: "ToolB"
    status: verified
  - wrong: "待确认2"
    correct: "ToolC"
    status: pending
`;
    const prompt = buildAsrPromptFromYaml(rawYaml);
    assert.strictEqual(prompt, "ToolB");
  });

  it("truncates entries to 64 when verified items exceed 64", () => {
    const manyEntries = Array.from({ length: 80 }, (_, i) => ({
      wrong: `wrong_${i}`,
      correct: `Term_${i}`,
      status: "verified",
    }));

    const prompt = buildAsrPromptFromEntries(manyEntries);
    const terms = prompt.split(", ");
    assert.strictEqual(terms.length, 64);
    assert.strictEqual(terms[0], "Term_0");
    assert.strictEqual(terms[63], "Term_63");
  });

  it("returns empty prompt and never throws when glossary file is missing or corrupted", () => {
    const nonExistentPath = resolve("./tests/sandbox/non-existent-glossary.yaml");
    const missingPrompt = loadAsrGlossaryPrompt(nonExistentPath);
    assert.strictEqual(missingPrompt, "");

    const corruptedYaml = "invalid: [yaml: : forbidden content:::";
    const corruptedPrompt = buildAsrPromptFromYaml(corruptedYaml);
    assert.strictEqual(corruptedPrompt, "");

    const nonDictYaml = "- a\n- b";
    const nonDictPrompt = buildAsrPromptFromYaml(nonDictYaml);
    assert.strictEqual(nonDictPrompt, "");
  });

  it("loads existing repository glossary successfully", () => {
    const realGlossary = loadAsrGlossaryPrompt();
    assert.ok(realGlossary.length > 0, "Default glossary should load non-empty prompt");
    assert.ok(realGlossary.includes("WorkBuddy"));
    assert.ok(realGlossary.includes("ffmpeg"));
    assert.ok(realGlossary.includes("yt-dlp"));
    assert.ok(!realGlossary.includes("pending"));
  });

  it("resolves model names to local sizes with graceful fallback", () => {
    assert.strictEqual(resolveWhisperModelSize("whisper-medium"), "medium");
    assert.strictEqual(resolveWhisperModelSize("medium"), "medium");
    assert.strictEqual(resolveWhisperModelSize("openai/whisper-large-v3"), "large-v3");
    assert.strictEqual(resolveWhisperModelSize("whisper-large-v2"), "large-v2");
    assert.strictEqual(resolveWhisperModelSize("whisper-turbo"), "turbo");
    assert.strictEqual(resolveWhisperModelSize("whisper-1"), "medium");
    assert.strictEqual(resolveWhisperModelSize("invalid-model"), "medium");
    assert.strictEqual(resolveWhisperModelSize("", "base"), "base");
    assert.strictEqual(resolveWhisperModelSize(undefined, "small"), "small");
  });

  it("injects prompt into transcription request FormData and defaults to port 8000", async () => {
    const sandboxDir = resolve("./tests/sandbox");
    if (!existsSync(sandboxDir)) {
      mkdirSync(sandboxDir, { recursive: true });
    }
    const testAudioPath = resolve(sandboxDir, "mock-asr-prompt-test.mp4");
    writeFileSync(testAudioPath, "fake audio stream");

    try {
      const capturedRequests: { url: string; prompt: string | null; model: string | null }[] = [];

      const customFetcher = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const formData = init?.body as FormData;
        capturedRequests.push({
          url: url.toString(),
          prompt: formData.get("prompt") as string | null,
          model: formData.get("model") as string | null,
        });
        return new Response(JSON.stringify({ text: "Mock transcript with glossary" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const transcriber = createAudioTranscriber({
        customFetcher,
        prompt: "WorkBuddy, ffmpeg",
        // 转码由 ffmpeg 负责，单测里用恒等替换，专注验证 prompt 注入
        customTranscoder: async (buffer: Buffer) => buffer,
      });

      const result = await transcriber(testAudioPath);
      assert.strictEqual(result, "Mock transcript with glossary");
      assert.strictEqual(capturedRequests.length, 1);
      assert.strictEqual(capturedRequests[0].url, "http://127.0.0.1:8000/v1/audio/transcriptions");
      assert.strictEqual(capturedRequests[0].prompt, "WorkBuddy, ffmpeg");
    } finally {
      if (existsSync(testAudioPath)) {
        unlinkSync(testAudioPath);
      }
    }
  });
});
