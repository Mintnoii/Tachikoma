import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeJsonParse } from "@tachikoma/core";

describe("Tachikoma Core: safeJsonParse Robustness Tests", () => {
  it("parses valid standard JSON correctly", () => {
    const raw = JSON.stringify({ key: "value", count: 42, active: true });
    const result = safeJsonParse(raw, {});
    assert.deepEqual(result, { key: "value", count: 42, active: true });
  });

  it("heals single-quoted and unquoted keys JSON using jsonrepair", () => {
    const raw = "{ key: 'value', numbers: [1, 2, 3], }";
    const result = safeJsonParse(raw, {});
    assert.deepEqual(result, { key: "value", numbers: [1, 2, 3] });
  });

  it("heals JSON with trailing commas and comments", () => {
    const raw = `
      {
        "title": "测试灵感",
        "tags": ["#CLI", "#Rust",],
      }
    `;
    const result = safeJsonParse(raw, null);
    assert.deepEqual(result, {
      title: "测试灵感",
      tags: ["#CLI", "#Rust"],
    });
  });

  it("gracefully falls back when raw is non-string or empty", () => {
    const fallback = { fallback: true };
    assert.deepEqual(safeJsonParse("", fallback), fallback);
    assert.deepEqual(safeJsonParse("   ", fallback), fallback);
    assert.deepEqual(safeJsonParse(null as any, fallback), fallback);
    assert.deepEqual(safeJsonParse(undefined as any, fallback), fallback);
    assert.deepEqual(safeJsonParse(12345 as any, fallback), fallback);
  });

  it("gracefully falls back when raw is totally unrepairable garbage", () => {
    const fallback = ["default"];
    const result = safeJsonParse("not a json at all {{{ broken", fallback);
    assert.deepEqual(result, fallback);
  });
});
