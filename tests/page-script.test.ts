import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toPageScript } from "@tachikoma/core";

describe("toPageScript", () => {
  it("让字符串函数真正被调用（Playwright 语义）", async () => {
    // Playwright 只在收到函数值时才带参调用；直接传 "async (n) => n * 2" 会求值成函数对象，
    // 序列化后变成 undefined —— 这正是历史 "evaluate 返回值为空或非对象" 的根因。
    const fn = toPageScript<number, number>("async (n) => n * 2");
    assert.equal(await fn(21), 42);
  });

  it("支持无参脚本", async () => {
    const fn = toPageScript<undefined, string>("() => 'ok'");
    assert.equal(await fn(undefined), "ok");
  });

  it("透传对象参数", async () => {
    const fn = toPageScript<{ id: string }, string>("(arg) => `id=${arg.id}`");
    assert.equal(await fn({ id: "7408518102100561189" }), "id=7408518102100561189");
  });
});
