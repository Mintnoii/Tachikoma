import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "pathe";
import {
  resolveGhostVaultRoot,
  loadGhostTombstones,
  isTombstoneIgnored,
  TombstoneSet,
} from "../packages/core/src/tombstone.js";

test("Tachikoma: Ghost Tombstone 对账与防重测试", async (t) => {
  const mockTombstones: TombstoneSet = {
    urls: new Set([
      "https://mp.weixin.qq.com/s/sample_ad_article",
      "https://mp.weixin.qq.com/s/sample_ad_article?sn=123",
    ]),
    ids: new Set(["78901234567"]),
    titles: new Set(["40个代码版本带你开发企业级agent"]),
  };

  await t.test("isTombstoneIgnored 校验 URL/AwemeID/Title 准确性", () => {
    // 1. 命中墓碑 URL
    assert.ok(isTombstoneIgnored({ url: "https://mp.weixin.qq.com/s/sample_ad_article" }, mockTombstones));
    assert.ok(isTombstoneIgnored({ url: "https://mp.weixin.qq.com/s/sample_ad_article?sn=123&mid=456" }, mockTombstones));

    // 2. 命中 AwemeID
    assert.ok(isTombstoneIgnored({ awemeId: "78901234567" }, mockTombstones));

    // 3. 命中 Title
    assert.ok(isTombstoneIgnored({ title: "40个代码版本带你开发企业级Agent" }, mockTombstones));

    // 4. 未命中正常素材
    assert.equal(isTombstoneIgnored({ url: "https://mp.weixin.qq.com/s/normal_tech_article" }, mockTombstones), false);
    assert.equal(isTombstoneIgnored({ awemeId: "99999999999" }, mockTombstones), false);
  });

  await t.test("resolveGhostVaultRoot 智能识别 Ghost/_raw 与其子路径并回溯至仓库根", () => {
    // 1. 传入 Ghost 根目录原样返回
    assert.equal(resolveGhostVaultRoot("C:/Workspace/Ghost"), "C:/Workspace/Ghost");

    // 2. 传入 Ghost/_raw 智能回溯至 Ghost
    assert.equal(resolveGhostVaultRoot("C:/Workspace/Ghost/_raw"), "C:/Workspace/Ghost");

    // 3. 传入 Ghost/_raw/douyin/AI存档 等深层子路径
    assert.equal(
      resolveGhostVaultRoot("C:/Workspace/Ghost/_raw/douyin/AI存档"),
      "C:/Workspace/Ghost"
    );
    assert.equal(
      resolveGhostVaultRoot("C:/Workspace/Ghost/_raw/articles"),
      "C:/Workspace/Ghost"
    );

    // 4. 相对路径兼容性
    assert.equal(resolveGhostVaultRoot("Ghost/_raw"), "Ghost");
    assert.equal(resolveGhostVaultRoot("_raw"), ".");
    assert.equal(resolveGhostVaultRoot("_raw/douyin"), ".");
  });

  await t.test("loadGhostTombstones 从传入的 Ghost/_raw 子目录自动穿透加载 .cache/ignored.json", () => {
    const sandboxDir = join(process.cwd(), "tests", "sandbox", "tombstone-resolve-test");
    const ghostRoot = join(sandboxDir, "Ghost");
    const cacheDir = join(ghostRoot, ".cache");
    const rawDouyinDir = join(ghostRoot, "_raw", "douyin", "AI存档");

    try {
      mkdirSync(cacheDir, { recursive: true });
      mkdirSync(rawDouyinDir, { recursive: true });

      const mockRecords = [
        {
          identifier: "tomb_1001",
          awemeId: "7310000000001",
          sourceUrl: "https://www.douyin.com/video/7310000000001",
          title: "低质营销号合集",
          entry: "douyin",
          reason: "无价值广告",
          ignoredAt: new Date().toISOString(),
        },
      ];

      writeFileSync(join(cacheDir, "ignored.json"), JSON.stringify(mockRecords), "utf-8");

      // 从 _raw 深层子目录加载墓碑
      const tombstones = loadGhostTombstones(rawDouyinDir);
      assert.ok(tombstones.ids.has("7310000000001"));
      assert.ok(tombstones.titles.has("低质营销号合集"));
      assert.ok(
        isTombstoneIgnored({ awemeId: "7310000000001" }, tombstones)
      );
    } finally {
      rmSync(sandboxDir, { recursive: true, force: true });
    }
  });
});
