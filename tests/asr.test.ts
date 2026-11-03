import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "pathe";
import { createAudioTranscriber } from "@tachikoma/douyin-sync";

describe("Tachikoma ASR Client Tests", () => {
  it("gracefully falls back to undefined when ASR server is unreachable", async () => {
    const testFile = resolve("./tests/sandbox/mock-unreachable-audio.mp4");
    try {
      writeFileSync(testFile, "mock audio binary content");
      const transcriber = createAudioTranscriber({
        baseUrl: "http://127.0.0.1:59999/v1", // 不存在的本地端口
        timeoutMs: 500,
        customTranscoder: async (buffer: Buffer) => buffer,
      });

      const result = await transcriber(testFile);
      assert.strictEqual(result, undefined, "unreachable server should return undefined without throwing");

      const emptyResult = await transcriber("");
      assert.strictEqual(emptyResult, undefined, "empty source should return undefined");
    } finally {
      try {
        unlinkSync(testFile);
      } catch {
        // ignore
      }
    }
  });

  it("successfully posts audio to OpenAI Audio API compliant server and returns transcript", async () => {
    // 建立一个 Mock HTTP Server 响应标准的 OpenAI Audio API
    let receivedAuth = "";
    let receivedMethod = "";
    let receivedUrl = "";

    const server = createServer(async (req, res) => {
      receivedAuth = req.headers.authorization ?? "";
      receivedMethod = req.method ?? "";
      receivedUrl = req.url ?? "";

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: "这是 Mock ASR 转录得到的中文视频文稿内容。" }));
    });

    await new Promise<void>((resolvePromise) => {
      server.listen(0, "127.0.0.1", () => resolvePromise());
    });

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const testFile = resolve("./tests/sandbox/mock-audio.mp4");

    try {
      writeFileSync(testFile, "mock audio binary content");

      const transcriber = createAudioTranscriber({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: "test-token-key",
        customTranscoder: async (buffer: Buffer) => buffer,
      });

      const transcript = await transcriber(testFile);

      assert.strictEqual(transcript, "这是 Mock ASR 转录得到的中文视频文稿内容。");
      assert.strictEqual(receivedMethod, "POST");
      assert.strictEqual(receivedUrl, "/v1/audio/transcriptions");
      assert.strictEqual(receivedAuth, "Bearer test-token-key");
    } finally {
      server.close();
      try {
        unlinkSync(testFile);
      } catch {
        // ignore
      }
    }
  });
});

