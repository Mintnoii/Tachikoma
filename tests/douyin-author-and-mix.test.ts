import test from "node:test";
import assert from "node:assert/strict";
import { rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "pathe";
import {
  openBrowserBridge,
  fetchMixAwemes,
  fetchAllMixAwemes,
  fetchAuthorAwemes,
  fetchAllAuthorAwemes,
  loadSyncRulesConfig,
  syncAuthors,
  syncMixes,
  syncDouyinAll,
  openReconcilerDb,
  getCheckpoint,
  closeReconcilerDb,
  type BrowserBridge,
} from "@tachikoma/douyin-sync";
import { program } from "@tachikoma/cli";

const SANDBOX_DIR = join(process.cwd(), "tests/sandbox/douyin-author-mix-test");
const DB_PATH = join(SANDBOX_DIR, ".cache/sync.db");

test("OpenSpec: 抖音作者主页 (Authors) 与合集专栏 (Mixes) 增量同步测试", async (t) => {
  await rm(SANDBOX_DIR, { recursive: true, force: true });

  t.after(async () => {
    await rm(SANDBOX_DIR, { recursive: true, force: true });
  });

  await t.test("1.1 & 1.2: fetchMixAwemes & fetchAllMixAwemes 纯函数与分页拉取", async () => {
    let capturedParams: Record<string, unknown> = {};
    const mockBridge: BrowserBridge = {
      ensurePage: async () => ({} as any),
      close: async () => {},
      requestJson: async <T = any>(path: string, params?: Record<string, unknown>): Promise<T> => {
        capturedParams = params ?? {};
        const cursor = Number(params?.cursor ?? 0);
        if (cursor === 0) {
          return {
            status_code: 0,
            has_more: 1,
            cursor: 20,
            aweme_list: [
              {
                aweme_id: "mix_aweme_1",
                desc: "合集作品第一集",
                aweme_type: 4,
                author: { uid: "u1", sec_uid: "sec_1", nickname: "专栏作者" },
              },
              {
                aweme_id: "mix_aweme_2",
                desc: "合集作品第二集",
                aweme_type: 4,
                author: { uid: "u1", sec_uid: "sec_1", nickname: "专栏作者" },
              },
            ],
          } as T;
        } else {
          return {
            status_code: 0,
            has_more: 0,
            cursor: 40,
            aweme_list: [
              {
                aweme_id: "mix_aweme_3",
                desc: "合集作品第三集",
                aweme_type: 4,
                author: { uid: "u1", sec_uid: "sec_1", nickname: "专栏作者" },
              },
            ],
          } as T;
        }
      },
    };

    // 1. fetchMixAwemes 单页拉取验证
    const singlePage = await fetchMixAwemes(mockBridge, "mix_888", 0, 20);
    assert.equal(capturedParams.mix_id, "mix_888");
    assert.equal(capturedParams.device_platform, "webapp");
    assert.equal(capturedParams.aid, 6383);
    assert.equal(singlePage.items.length, 2);
    assert.equal(singlePage.hasMore, true);
    assert.equal(singlePage.cursor, 20);

    // 2. fetchAllMixAwemes 全量分页与截断验证
    const all = await fetchAllMixAwemes(mockBridge, "mix_888", 0, 20, 10, 0);
    assert.equal(all.items.length, 3);
    assert.equal(all.items[0].id, "mix_aweme_1");
    assert.equal(all.items[2].id, "mix_aweme_3");
    assert.equal(all.hasMore, false);

    // 3. fetchAllMixAwemes maxCount 截断
    const truncated = await fetchAllMixAwemes(mockBridge, "mix_888", 2, 20, 10, 0);
    assert.equal(truncated.items.length, 2);
    assert.equal(truncated.hasMore, true);
  });

  await t.test("1.1 & 1.2: fetchAuthorAwemes & fetchAllAuthorAwemes 纯函数与分页拉取", async () => {
    let capturedParams: Record<string, unknown> = {};
    const mockBridge: BrowserBridge = {
      ensurePage: async () => ({} as any),
      close: async () => {},
      requestJson: async <T = any>(_path: string, params?: Record<string, unknown>): Promise<T> => {
        capturedParams = params ?? {};
        const cursor = Number(params?.max_cursor ?? 0);
        if (cursor === 0) {
          return {
            status_code: 0,
            has_more: 1,
            max_cursor: 18,
            aweme_list: [
              {
                aweme_id: "author_aweme_1",
                desc: "作者主页置顶作品",
                aweme_type: 4,
                author: { uid: "u9", sec_uid: "sec_author", nickname: "神经元出逃计划" },
              },
              {
                aweme_id: "author_aweme_2",
                desc: "作者主页第二条作品",
                aweme_type: 4,
                author: { uid: "u9", sec_uid: "sec_author", nickname: "神经元出逃计划" },
              },
            ],
          } as T;
        } else {
          return {
            status_code: 0,
            has_more: 0,
            max_cursor: 36,
            aweme_list: [
              {
                aweme_id: "author_aweme_3",
                desc: "作者主页第三条作品",
                aweme_type: 4,
                author: { uid: "u9", sec_uid: "sec_author", nickname: "神经元出逃计划" },
              },
            ],
          } as T;
        }
      },
    };

    // 1. fetchAuthorAwemes 单页拉取验证
    const singlePage = await fetchAuthorAwemes(mockBridge, "sec_author", 0, 18);
    assert.equal(capturedParams.sec_user_id, "sec_author");
    assert.equal(capturedParams.max_cursor, 0);
    assert.equal(capturedParams.device_platform, "webapp");
    assert.equal(capturedParams.aid, 6383);
    assert.equal(singlePage.items.length, 2);
    assert.equal(singlePage.hasMore, true);
    assert.equal(singlePage.cursor, 18);

    // 2. fetchAllAuthorAwemes 全量分页与断点游标
    const all = await fetchAllAuthorAwemes(mockBridge, "sec_author", 0, 18, 10, 0);
    assert.equal(all.items.length, 3);
    assert.equal(all.items[0].id, "author_aweme_1");
    assert.equal(all.items[2].id, "author_aweme_3");
    assert.equal(all.hasMore, false);

    // 3. fetchAllAuthorAwemes 带 startCursor
    const fromCursor = await fetchAllAuthorAwemes(mockBridge, "sec_author", 0, 18, 10, 18);
    assert.equal(fromCursor.items.length, 1);
    assert.equal(fromCursor.items[0].id, "author_aweme_3");
  });

  await t.test("1.3 & 3.1: loadSyncRulesConfig 解析 yaml 中的 authors 与 mixes 配置", () => {
    const rules = loadSyncRulesConfig();
    assert.ok(Array.isArray(rules.authors));
    assert.ok(Array.isArray(rules.mixes));

    const author = rules.authors?.find((a) => a.nickname === "神经元出逃计划");
    assert.ok(author);
    assert.equal(author?.sec_uid, "MS4wLjABAAAA_ygszDRK-qMWn_87MWCX19jqvAnt_ODAkUR6UHRB-1Q");
    assert.equal(author?.max_count, 5);
  });

  await t.test("2.1, 2.2 & 2.3: syncAuthors 增量拉取、落盘目录路由与检查点保存", async () => {
    const mockTransport = async (path: string, params?: Record<string, unknown>) => {
      if (path.includes("/aweme/v1/web/aweme/post/")) {
        return {
          status_code: 0,
          has_more: 0,
          max_cursor: 18,
          aweme_list: [
            {
              aweme_id: "author_post_101",
              desc: "神经元出逃计划：心智模型的本质",
              aweme_type: 4,
              author: {
                uid: "u99",
                sec_uid: "sec_author_99",
                nickname: "神经元出逃计划",
              },
              create_time: 1730400000,
            },
          ],
        };
      }
      return {};
    };

    const results = await syncAuthors({
      outputDir: SANDBOX_DIR,
      sqlitePath: DB_PATH,
      authors: [
        {
          sec_uid: "sec_author_99",
          nickname: "神经元出逃计划",
          max_count: 5,
        },
      ],
      customTransport: mockTransport,
      customTranscribe: async () => "心智模型的本质转录文本",
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].title, "神经元出逃计划：心智模型的本质");

    // 验证落盘目录路径：Ghost/_raw/douyin/authors/<nickname>/<title>.md
    const expectedFilePath = join(
      SANDBOX_DIR,
      "douyin/authors/神经元出逃计划/神经元出逃计划：心智模型的本质.md"
    );
    assert.ok(existsSync(expectedFilePath), `文件应存在于: ${expectedFilePath}`);

    const content = await readFile(expectedFilePath, "utf-8");
    assert.ok(content.includes("神经元出逃计划：心智模型的本质"));
    assert.ok(content.includes("sec_author_99"));

    // 验证检查点持久化：target_type = "author", target_id = sec_uid
    const db = openReconcilerDb(DB_PATH);
    const cp = getCheckpoint(db, "author", "sec_author_99");
    assert.ok(cp);
    assert.equal(cp?.lastCursor, 0); // hasMore 为 false 时归零以便下次从最新开始拉取
    closeReconcilerDb(db);

    // 验证对账防重：二次运行无需增量摄入
    const secondRun = await syncAuthors({
      outputDir: SANDBOX_DIR,
      sqlitePath: DB_PATH,
      authors: [
        {
          sec_uid: "sec_author_99",
          nickname: "神经元出逃计划",
          max_count: 5,
        },
      ],
      customTransport: mockTransport,
      customTranscribe: async () => "心智模型的本质转录文本",
    });
    assert.equal(secondRun.length, 0);
  });

  await t.test("2.1, 2.2 & 2.3: syncMixes 增量拉取、落盘目录路由与检查点保存", async () => {
    const mockTransport = async (path: string, params?: Record<string, unknown>) => {
      if (path.includes("/aweme/v1/web/mix/aweme/")) {
        return {
          status_code: 0,
          has_more: 1,
          cursor: 20,
          aweme_list: [
            {
              aweme_id: "mix_post_201",
              desc: "系统思考进阶 第一讲",
              aweme_type: 4,
              author: {
                uid: "u77",
                sec_uid: "sec_author_77",
                nickname: "思考导师",
              },
              create_time: 1730401000,
            },
          ],
        };
      }
      return {};
    };

    const results = await syncMixes({
      outputDir: SANDBOX_DIR,
      sqlitePath: DB_PATH,
      mixes: [
        {
          mix_id: "mix_777",
          name: "系统思考进阶",
          max_count: 10,
        },
      ],
      customTransport: mockTransport,
      customTranscribe: async () => "系统思考进阶转录文本",
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].title, "系统思考进阶 第一讲");

    // 验证落盘目录路径：Ghost/_raw/douyin/mixes/<mixName>/<title>.md
    const expectedFilePath = join(
      SANDBOX_DIR,
      "douyin/mixes/系统思考进阶/系统思考进阶 第一讲.md"
    );
    assert.ok(existsSync(expectedFilePath), `文件应存在于: ${expectedFilePath}`);

    // 验证检查点持久化：target_type = "mix", target_id = mix_id
    const db = openReconcilerDb(DB_PATH);
    const cp = getCheckpoint(db, "mix", "mix_777");
    assert.ok(cp);
    assert.equal(cp?.lastCursor, 20); // hasMore 为 true 时保存断点游标 20
    closeReconcilerDb(db);
  });

  await t.test("2.2: syncDouyinAll 统一门面支持三轨协同与专项单轨调度", async () => {
    const mockTransport = async (path: string, params?: Record<string, unknown>) => {
      if (path.includes("/aweme/v1/web/collects/list/")) {
        return {
          status_code: 0,
          collects_list: [{ collects_id: "col_1", collects_name: "AI收藏", total_number: 1 }],
          has_more: 0,
          cursor: 0,
        };
      }
      if (path.includes("/aweme/v1/web/collects/video/list/")) {
        return {
          status_code: 0,
          has_more: 0,
          cursor: 1,
          aweme_list: [
            {
              aweme_id: "col_item_1",
              desc: "收藏夹条目",
              aweme_type: 4,
              author: { uid: "u0", sec_uid: "s0", nickname: "作者0" },
              create_time: 1730402000,
            },
          ],
        };
      }
      if (path.includes("/aweme/v1/web/aweme/post/")) {
        const secUid = String(params?.sec_user_id ?? "unknown");
        return {
          status_code: 0,
          has_more: 0,
          max_cursor: 1,
          aweme_list: [
            {
              aweme_id: `author_item_${secUid}`,
              desc: `作者条目_${secUid}`,
              aweme_type: 4,
              author: { uid: "u1", sec_uid: secUid, nickname: "作者" },
              create_time: 1730402100,
            },
          ],
        };
      }
      if (path.includes("/aweme/v1/web/mix/aweme/")) {
        return {
          status_code: 0,
          has_more: 0,
          cursor: 1,
          aweme_list: [
            {
              aweme_id: "mix_item_1",
              desc: "合集条目",
              aweme_type: 4,
              author: { uid: "u2", sec_uid: "s2", nickname: "作者2" },
              create_time: 1730402200,
            },
          ],
        };
      }
      return {};
    };

    // 1. 三轨全开协同同步
    const allRes = await syncDouyinAll(
      {
        outputDir: SANDBOX_DIR,
        sqlitePath: DB_PATH,
        filterRules: {
          collections: ["AI收藏"],
          authors: [{ sec_uid: "s1", nickname: "作者1" }],
          mixes: [{ mix_id: "m1", name: "合集1" }],
        },
        customTransport: mockTransport,
        customTranscribe: async () => "协同同步转录文本",
      }
    );

    assert.equal(allRes.total, 3);
    assert.equal(allRes.collections.length, 1);
    assert.equal(allRes.authors.length, 1);
    assert.equal(allRes.mixes.length, 1);

    // 2. 专项触发：仅同步作者
    const authorOnly = await syncDouyinAll(
      {
        outputDir: SANDBOX_DIR,
        sqlitePath: DB_PATH,
        authorNickname: "独立作者",
        customTransport: mockTransport,
        customTranscribe: async () => "独立作者转录文本",
      },
      { authorSecUid: "single_author_uid" }
    );
    assert.equal(authorOnly.collections.length, 0);
    assert.equal(authorOnly.mixes.length, 0);
    assert.equal(authorOnly.authors.length, 1);
    assert.equal(authorOnly.total, 1);
  });

  await t.test("3.2: CLI sync 命令支持 --author 与 --mix 选项定义", () => {
    const syncCmd = program.commands.find((c) => c.name() === "sync");
    assert.ok(syncCmd);

    const optionFlags = syncCmd.options.map((opt) => opt.flags);
    assert.ok(optionFlags.some((f) => f.includes("--author")));
    assert.ok(optionFlags.some((f) => f.includes("--mix")));
    assert.ok(optionFlags.some((f) => f.includes("--collect-id")));
  });
});
