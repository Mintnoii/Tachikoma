import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterCollectFolders, type CollectFilterRules } from "@tachikoma/douyin-sync";
import type { DouyinCollectionFolder } from "@tachikoma/douyin-sync";

describe("filterCollectFolders 收藏夹规则匹配引擎", () => {
  const sampleFolders: DouyinCollectionFolder[] = [
    { id: "1", name: "AI存档", totalCount: 84 },
    { id: "2", name: "面试存档", totalCount: 19 },
    { id: "3", name: "认知存档", totalCount: 27 },
    { id: "4", name: "心理学存档", totalCount: 4 },
    { id: "5", name: "文案", totalCount: 17 },
    { id: "6", name: "吃吃吃吃吃", totalCount: 2 },
    { id: "7", name: "Mbti", totalCount: 28 },
    { id: "8", name: "旅游", totalCount: 39 },
  ];

  it("精确匹配 collections 列表", () => {
    const rules: CollectFilterRules = {
      collections: ["文案", "旅游"],
    };
    const matched = filterCollectFolders(sampleFolders, rules);
    assert.equal(matched.length, 2);
    assert.deepEqual(
      matched.map((f) => f.name),
      ["文案", "旅游"]
    );
  });

  it("子串关键字匹配 nameKeywords 列表", () => {
    const rules: CollectFilterRules = {
      nameKeywords: ["存档"],
    };
    const matched = filterCollectFolders(sampleFolders, rules);
    assert.equal(matched.length, 4);
    assert.deepEqual(
      matched.map((f) => f.name),
      ["AI存档", "面试存档", "认知存档", "心理学存档"]
    );
  });

  it("精确与关键字规则取并集，并按 id 去重", () => {
    const rules: CollectFilterRules = {
      collections: ["AI存档", "吃吃吃吃吃"], // AI存档同时命中了关键字
      nameKeywords: ["存档"],
    };
    const matched = filterCollectFolders(sampleFolders, rules);
    // 4个存档 + 1个吃吃吃吃吃 = 5
    assert.equal(matched.length, 5);
    const names = matched.map((f) => f.name);
    assert.ok(names.includes("吃吃吃吃吃"));
    assert.ok(names.includes("AI存档"));
    // 确保 AI 存档没有重复
    assert.equal(names.filter((n) => n === "AI存档").length, 1);
  });

  it("空关键字安全防御：strip 后为空的关键字不能造成恒真全量匹配", () => {
    const rules: CollectFilterRules = {
      nameKeywords: ["  ", ""],
      collections: [],
    };
    const matched = filterCollectFolders(sampleFolders, rules);
    assert.equal(matched.length, 0);
  });

  it("规则全空时返回空列表，作为安全门禁阻断全量同步", () => {
    const matched = filterCollectFolders(sampleFolders, {});
    assert.equal(matched.length, 0);
  });
});
