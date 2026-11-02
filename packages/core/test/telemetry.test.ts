/**
 * @file packages/core/test/telemetry.test.ts
 * @description Tachikoma Fail-Silent 遥测发射器单测
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { createTachikomaReporter } from "../src/telemetry.js";

describe("Tachikoma 遥测探针中间件 (Fail-Silent Contract)", () => {
  it("离线状态下自动静默跳过并透传原业务结果", async () => {
    const reporter = createTachikomaReporter({
      endpoint: "http://127.0.0.1:59999", // 无效端口
      probeTimeoutMs: 30,
    });

    const isOnline = await reporter.probe();
    assert.strictEqual(isOnline, false);

    const data = await reporter.step("fetch_step", () => {
      return { status: 200, title: "测试文章" };
    });

    assert.deepStrictEqual(data, { status: 200, title: "测试文章" });
  });

  it("真实业务异常时 Fail-Fast 抛出，绝不吞掉错误", async () => {
    const reporter = createTachikomaReporter({
      endpoint: "http://127.0.0.1:59999",
      probeTimeoutMs: 30,
    });

    await assert.rejects(
      async () => {
        await reporter.step("failing_step", () => {
          throw new Error("抓取目标 404 Not Found");
        });
      },
      {
        name: "Error",
        message: "抓取目标 404 Not Found",
      }
    );
  });
});
