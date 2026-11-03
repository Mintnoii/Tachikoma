import test from "node:test";
import assert from "node:assert/strict";
import { rm, mkdir } from "node:fs/promises";
import { join } from "pathe";
import {
  deepFindAwemeItem,
  openBrowserBridge,
  closeBrowserBridge,
  DouyinExtractionError,
  fetchPublicAwemeItem,
} from "@tachikoma/douyin-sync";
import { ingestDouyinToSparks } from "@tachikoma/cli";
import { openSparksDb, closeSparksDb, getSparkById } from "@tachikoma/core";

const SANDBOX_DIR = join(process.cwd(), "tests/sandbox/extraction-resilience-test");
const DB_PATH = join(SANDBOX_DIR, "sparks.db");

test("Douyin Extraction Resilience & Diagnostic Failure Tests", async (t) => {
  await rm(SANDBOX_DIR, { recursive: true, force: true });
  await mkdir(SANDBOX_DIR, { recursive: true });

  t.after(async () => {
    await rm(SANDBOX_DIR, { recursive: true, force: true });
  });

  await t.test("4.1: deepFindAwemeItem finds item across arbitrary depths and array nests", () => {
    // 1. 直接顶层命中
    const directItemList = {
      item_list: [
        {
          aweme_id: "7701000000000000001",
          desc: "顶层 item_list 视频",
          video: { play_addr: { url_list: ["https://example.com/v1.mp4"] } },
        },
      ],
    };
    const hit1 = deepFindAwemeItem(directItemList);
    assert.equal(hit1?.aweme_id, "7701000000000000001");
    assert.equal(hit1?.desc, "顶层 item_list 视频");

    // 2. 5 层深层嵌套命中 (五层深度)
    const fiveLevelsDeep = {
      level1: {
        meta: { region: "CN" },
        level2: {
          trace: "node_alpha",
          level3: {
            payload: {
              level4: {
                level5: {
                  aweme_id: "7705555555555555555",
                  desc: "五层深度嵌套作品",
                  images: [{ url_list: ["https://example.com/slide1.jpg"] }],
                },
              },
            },
          },
        },
      },
    };
    const hit2 = deepFindAwemeItem(fiveLevelsDeep);
    assert.equal(hit2?.aweme_id, "7705555555555555555");
    assert.equal(hit2?.desc, "五层深度嵌套作品");

    // 3. 数组内嵌套命中
    const arrayNested = {
      status_code: 0,
      extra: [
        { useless: 1 },
        {
          cards: [
            { empty: true },
            {
              item_list: [
                {
                  aweme_id: "7708888888888888888",
                  desc: "多重数组内部嵌套作品",
                  video: { play_addr: { url_list: ["https://example.com/v_nested.mp4"] } },
                },
              ],
            },
          ],
        },
      ],
    };
    const hit3 = deepFindAwemeItem(arrayNested);
    assert.equal(hit3?.aweme_id, "7708888888888888888");
    assert.equal(hit3?.desc, "多重数组内部嵌套作品");

    // 4. 环形引用防死循环 (visited 集合防环)
    const circular: Record<string, any> = { name: "outer" };
    circular.self = circular;
    circular.inner = { parent: circular };
    const hitCircular = deepFindAwemeItem(circular);
    assert.equal(hitCircular, null);

    // 5. 超过 maxDepth 截断返回 null
    const tooDeep = {
      l1: { l2: { l3: { l4: { l5: { l6: { aweme_id: "999", video: {} } } } } } },
    };
    assert.equal(deepFindAwemeItem(tooDeep, 4), null);
    assert.ok(deepFindAwemeItem(tooDeep, 7));
  });

  await t.test("4.2: BrowserBridge.requestJson throws bridge-empty DouyinExtractionError instead of TypeError when evaluate returns undefined", async () => {
    // 模拟 page.evaluate 返回 undefined 的极端改版场景
    const mockPageUndefined = {
      evaluate: async () => undefined,
      isClosed: () => false,
      close: async () => {},
    } as any;

    const bridgeUndefined = openBrowserBridge({
      customPage: mockPageUndefined,
    });

    await assert.rejects(
      async () => {
        await bridgeUndefined.requestJson("/aweme/v1/web/aweme/detail/", {
          aweme_id: "7703453146412010779",
        });
      },
      (err: any) => {
        assert.ok(err instanceof DouyinExtractionError);
        assert.equal(err.reason, "bridge-empty");
        assert.ok(!err.message.includes("Cannot read properties of undefined"));
        assert.ok(err.attempts.some((a: string) => a.includes("/aweme/v1/web/aweme/detail/")));
        return true;
      }
    );

    // 模拟 page.evaluate 返回非对象格式
    const mockPageGarbage = {
      evaluate: async () => "not-a-valid-json-response",
      isClosed: () => false,
      close: async () => {},
    } as any;

    const bridgeGarbage = openBrowserBridge({
      customPage: mockPageGarbage,
    });

    await assert.rejects(
      async () => {
        await bridgeGarbage.requestJson("/aweme/v1/web/aweme/detail/", {
          aweme_id: "7703453146412010779",
        });
      },
      (err: any) => {
        assert.ok(err instanceof DouyinExtractionError);
        assert.equal(err.reason, "bridge-empty");
        return true;
      }
    );

    // 模拟接口响应 403 Forbidden 归类为 api-forbidden
    const mockPage403 = {
      evaluate: async () => ({ ok: false, status: 403, error: "Access Denied" }),
      isClosed: () => false,
      close: async () => {},
    } as any;

    const bridge403 = openBrowserBridge({
      customPage: mockPage403,
    });

    await assert.rejects(
      async () => {
        await bridge403.requestJson("/aweme/v1/web/aweme/detail/", {
          aweme_id: "7703453146412010779",
        });
      },
      (err: any) => {
        assert.ok(err instanceof DouyinExtractionError);
        assert.equal(err.reason, "api-forbidden");
        return true;
      }
    );
  });

  await t.test("3.2 & 3.3: DOM fallback sets dom-fallback confidence, and failures leave no dirty records in sparks.db", async () => {
    // 验证 DOM 兜底置信度降级
    const result = await fetchPublicAwemeItem("https://www.douyin.com/video/7709999999", {
      customExtractor: async () => ({
        id: "7709999999",
        desc: "仅有 DOM 标题的兜底作品",
        author: { uid: "", secUid: "", nickname: "未知作者" },
        createTime: 1730500000,
        mediaType: "video",
        shareUrl: "https://www.douyin.com/video/7709999999",
        confidence: "dom-fallback",
        source: "dom",
      }),
    });

    assert.equal(result.confidence, "dom-fallback");
    assert.equal(result.source, "dom");

    // 验证失败路径下 sparks.db 绝无半成品产生
    const testDbPath = join(SANDBOX_DIR, "clean-fail-test.db");
    const failingExtractor = async () => {
      throw new DouyinExtractionError("ssr-no-item", "测试触发全面失败", {
        attempts: ["ssr:_ROUTER_DATA", "in-page-xhr:403", "dom-fallback"],
      });
    };

    await assert.rejects(async () => {
      await ingestDouyinToSparks("https://www.douyin.com/video/7708888888", {
        sparksDbPath: testDbPath,
        customExtractor: failingExtractor,
      });
    });

    const db = openSparksDb(testDbPath);
    // 数据库可能仅有新建的空表，但不应该有任何记录
    const item = getSparkById(db, "7708888888");
    assert.equal(item, null);
    closeSparksDb(db);
  });
});
