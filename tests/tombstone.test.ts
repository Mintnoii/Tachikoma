import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "pathe";
import {
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
});
