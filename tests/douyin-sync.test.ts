import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "pathe";
import {
  openBrowserBridge,
  closeBrowserBridge,
  fetchCollectList,
  fetchCollectAwemes,
  openReconcilerDb,
  isSynced,
  markSynced,
  filterUnsynced,
  getCheckpoint,
  setCheckpoint,
  closeReconcilerDb,
  ocrGallery,
  processAweme,
  syncCollections,
  fetchAwemeDetailWithTranscript,
  DouyinAwemeItem,
} from "@tachikoma/douyin-sync";
import { sleep } from "radash";
import { readMarkdownFile } from "@tachikoma/core";

const SANDBOX_DIR = join(process.cwd(), "tests/sandbox/douyin-test");
const DB_PATH = join(SANDBOX_DIR, "state.db");

test("Phase 2: Douyin Sync Sub-App Comprehensive Tests", async (t) => {
  await rm(SANDBOX_DIR, { recursive: true, force: true });

  await t.test("Task 2.1: DouyinClient & BrowserBridge normalizes API responses", async () => {
    // 注入模拟响应
    const mockTransport = async (path: string, params?: Record<string, unknown>) => {
      if (path.includes("/aweme/v1/web/collects/list/")) {
        return {
          status_code: 0,
          collects_list: [
            { collects_id: "1001", collects_name: "系统架构与AI", total_number: 12 },
          ],
          has_more: 0,
          cursor: 0,
        };
      }
      if (path.includes("/aweme/v1/web/collects/video/list/")) {
        return {
          status_code: 0,
          aweme_list: [
            {
              aweme_id: "7200000001",
              desc: "攻壳机动队：认知架构设计解析",
              aweme_type: 68, // 图集
              images: [
                { url_list: ["https://example.com/img1.jpg"] },
                { url_list: ["https://example.com/img2.jpg"] },
              ],
              author: {
                uid: "u999",
                sec_uid: "sec_u999",
                nickname: "草薙素子",
              },
              create_time: 1730332800,
              statistics: { digg_count: 500, comment_count: 42 },
            },
            {
              aweme_id: "7200000002",
              desc: "塔奇克马自律思考回路实录",
              aweme_type: 4, // 视频
              video: {
                play_addr: { url_list: ["https://example.com/video1.mp4"] },
              },
              author: {
                uid: "u888",
                sec_uid: "sec_u888",
                nickname: "巴特",
              },
              create_time: 1730332900,
              statistics: { digg_count: 1200 },
            },
          ],
          has_more: 0,
          cursor: 2,
        };
      }
      return {};
    };

    const bridge = openBrowserBridge({ customTransport: mockTransport });

    const { folders } = await fetchCollectList(bridge);
    assert.equal(folders.length, 1);
    assert.equal(folders[0].name, "系统架构与AI");

    const { items } = await fetchCollectAwemes(bridge, "1001");
    assert.equal(items.length, 2);

    const galleryItem = items[0];
    assert.equal(galleryItem.mediaType, "gallery");
    assert.equal(galleryItem.author.nickname, "草薙素子");
    assert.equal(galleryItem.imageUrls?.length, 2);

    const videoItem = items[1];
    assert.equal(videoItem.mediaType, "video");
    assert.equal(videoItem.videoPlayUrl, "https://example.com/video1.mp4");

    await closeBrowserBridge(bridge);
  });

  await t.test("Task 2.2: SyncReconciler SQLite incremental tracking and checkpoints", () => {
    const db = openReconcilerDb(DB_PATH);

    assert.equal(isSynced(db, "item_1"), false);

    markSynced(db, "item_1", "标题1", "gallery", "作者1", "sha_dummy_1");
    assert.equal(isSynced(db, "item_1"), true);
    assert.equal(isSynced(db, "item_2"), false);

    const dummyItems: DouyinAwemeItem[] = [
      {
        id: "item_1",
        desc: "已存在",
        author: { uid: "1", secUid: "s1", nickname: "n1" },
        createTime: 100,
        mediaType: "gallery",
        shareUrl: "url1",
      },
      {
        id: "item_2",
        desc: "增量新作品",
        author: { uid: "2", secUid: "s2", nickname: "n2" },
        createTime: 200,
        mediaType: "video",
        shareUrl: "url2",
      },
    ];

    const unsynced = filterUnsynced(db, dummyItems);
    assert.equal(unsynced.length, 1);
    assert.equal(unsynced[0].id, "item_2");

    // 检查点
    setCheckpoint(db, "collect", "col_1001", 40);
    const cp = getCheckpoint(db, "collect", "col_1001");
    assert.ok(cp);
    assert.equal(cp?.lastCursor, 40);

    closeReconcilerDb(db);
  });

  await t.test("Task 2.3: MagpieGalleryOCR formats OpenAI-compatible vision requests", async () => {
    let capturedBody: any = null;

    const mockFetcher = async (url: string, init?: RequestInit) => {
      if (url.includes("/chat/completions")) {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "1. 架构第一性原理\n2. 零防御编程范式",
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(Buffer.from("mock image data"), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    };

    const result = await ocrGallery(["https://example.com/slide1.jpg"], {
      baseUrl: "http://127.0.0.1:3425/v1",
      apiKey: "test-magpie-key",
      model: "auto/gemini-3.8-flash",
      customFetcher: mockFetcher,
    });
    assert.ok(result.includes("第 1 张 / 共 1 张"));
    assert.ok(result.includes("零防御编程范式"));
    assert.equal(capturedBody.model, "auto/gemini-3.8-flash");
  });

  await t.test("Task 2.4: DouyinPipeline end-to-end sandbox run", async () => {
    const db = openReconcilerDb(DB_PATH);
    try {
      const testGalleryItem: DouyinAwemeItem = {
        id: "7300000001",
        desc: "攻壳机动队沙盒测试图集",
        author: {
          uid: "u100",
          secUid: "sec_u100",
          nickname: "少佐",
        },
        createTime: 1730332800,
        mediaType: "gallery",
        imageUrls: ["https://example.com/p1.jpg"],
        shareUrl: "https://www.douyin.com/video/7300000001",
      };

      const outcome = await processAweme(
        testGalleryItem,
        {
          outputDir: SANDBOX_DIR,
          downloadMedia: false,
          customOcr: async () => "这是图集的第一页测试文本",
        },
        db
      );

      assert.equal(outcome.title, "攻壳机动队沙盒测试图集");
      assert.equal(outcome.mediaType, "gallery");
      assert.ok(isSynced(db, "7300000001"), "作品已被标记对账");

      // 验证落盘文件格式与 RFC 规范
      const cardPath = join(SANDBOX_DIR, "douyin", "攻壳机动队沙盒测试图集.md");
      const parsed = await readMarkdownFile(cardPath);
      assert.equal(parsed.data.entry, "douyin-sync");
      assert.equal(parsed.data.media_type, "gallery");
      assert.ok(parsed.body.includes("图集作品 OCR 转录文字稿"));
      assert.ok(parsed.body.includes("这是图集的第一页测试文本"));
    } finally {
      closeReconcilerDb(db);
    }
  });

  await t.test("Task 2.5: DouyinPipeline video transcription with customTranscribe aligns with Ghost format", async () => {
    const db = openReconcilerDb(DB_PATH);
    try {
      let receivedSource = "";
      const testVideoItem: DouyinAwemeItem = {
        id: "7300000002",
        desc: "攻壳机动队：塔奇克马AI语音实录",
        author: {
          uid: "u200",
          secUid: "sec_u200",
          nickname: "巴特",
        },
        createTime: 1730332900,
        mediaType: "video",
        videoPlayUrl: "https://example.com/tachikoma_voice.mp4",
        shareUrl: "https://www.douyin.com/video/7300000002",
      };

      const outcome = await processAweme(
        testVideoItem,
        {
          outputDir: SANDBOX_DIR,
          downloadMedia: false,
          customTranscribe: async (source) => {
            receivedSource = source;
            return "大家好，我是塔奇克马！今天我们来讨论自律思考回路与 Ghost 的同步机制。";
          },
        },
        db
      );

      assert.equal(receivedSource, "https://example.com/tachikoma_voice.mp4");
      assert.equal(outcome.title, "攻壳机动队：塔奇克马AI语音实录");
      assert.equal(outcome.mediaType, "video");
      assert.ok(isSynced(db, "7300000002"), "作品已被标记对账");

      // 验证落盘文件格式与 Ghost RFC 规范
      const cardPath = join(SANDBOX_DIR, "douyin", "攻壳机动队：塔奇克马AI语音实录.md");
      const parsed = await readMarkdownFile(cardPath);
      assert.equal(parsed.data.entry, "douyin-sync");
      assert.equal(parsed.data.media_type, "video");
      assert.ok(parsed.body.includes("# 攻壳机动队：塔奇克马AI语音实录"));
      assert.ok(parsed.body.includes("> 创作者: [巴特](https://www.douyin.com/user/sec_u200)"));
      assert.ok(parsed.body.includes("> 原始链接: https://www.douyin.com/video/7300000002"));
      assert.ok(parsed.body.includes("## 转录内容 / Notes"));
      assert.ok(parsed.body.includes("大家好，我是塔奇克马！今天我们来讨论自律思考回路与 Ghost 的同步机制。"));
    } finally {
      closeReconcilerDb(db);
    }
  });

  await t.test("Task 2.6: 视频若未能获取到有效音频转录，processAweme 直接抛错，严禁落盘且不标记对账 (Zero-Dirty-Card)", async () => {
    const db = openReconcilerDb(DB_PATH);
    try {
      const testVideoItem: DouyinAwemeItem = {
        id: "7300000003",
        desc: "无转录文本仅有描述的作品",
        author: {
          uid: "u300",
          secUid: "sec_u300",
          nickname: "陀古萨",
        },
        createTime: 1730333000,
        mediaType: "video",
        videoPlayUrl: "https://example.com/sample.mp4",
        shareUrl: "https://www.douyin.com/video/7300000003",
      };

      // customTranscribe 返回 undefined 或空白，模拟 ASR 故障
      await assert.rejects(
        async () => {
          await processAweme(
            testVideoItem,
            {
              outputDir: SANDBOX_DIR,
              downloadMedia: false,
              customTranscribe: async () => undefined,
            },
            db
          );
        },
        /视频语音转录失败或结果为空/
      );

      // 验证绝不落盘，保持 Ghost 绝对纯洁
      const cardPath = join(SANDBOX_DIR, "douyin", "无转录文本仅有描述的作品.md");
      assert.equal(existsSync(cardPath), false, "Ghost 目录中绝不应存在无有效转录的脏卡片");

      // 验证绝不在对账库标记已同步
      assert.equal(isSynced(db, "7300000003"), false, "转录失败的作品绝不标记已对账");
    } finally {
      closeReconcilerDb(db);
    }
  });

  await t.test("Task 2.7: 图集作品若 OCR 失败或为空，processAweme 直接抛错，严禁落盘且不标记对账", async () => {
    const db = openReconcilerDb(DB_PATH);
    try {
      const testGalleryItem: DouyinAwemeItem = {
        id: "7300000004",
        desc: "OCR失败的图集作品",
        author: {
          uid: "u400",
          secUid: "sec_u400",
          nickname: "荒卷大辅",
        },
        createTime: 1730333100,
        mediaType: "gallery",
        imageUrls: ["https://example.com/img1.jpg"],
        shareUrl: "https://www.douyin.com/video/7300000004",
      };

      // customOcr 返回空白，模拟 OCR 全败
      await assert.rejects(
        async () => {
          await processAweme(
            testGalleryItem,
            {
              outputDir: SANDBOX_DIR,
              downloadMedia: false,
              customOcr: async () => "   ",
            },
            db
          );
        },
        /图集 OCR 转录失败或结果为空/
      );

      const cardPath = join(SANDBOX_DIR, "douyin", "OCR失败的图集作品.md");
      assert.equal(existsSync(cardPath), false, "OCR 失败的图集绝不写入 Ghost 知识库");
      assert.equal(isSynced(db, "7300000004"), false, "OCR 失败的作品绝不标记对账");
    } finally {
      closeReconcilerDb(db);
    }
  });

  await t.test("Task 2.8: DouyinPipeline folderName routes card into sub-directory outputDir/douyin/<folderName>/<title>.md", async () => {
    const testItem: DouyinAwemeItem = {
      id: "7300000005",
      desc: "认知重塑与心智模型构建",
      author: {
        uid: "u500",
        secUid: "sec_u500",
        nickname: "塔奇克马研究员",
      },
      createTime: 1730333200,
      mediaType: "video",
      shareUrl: "https://www.douyin.com/video/7300000005",
    };

    const outcome = await processAweme(
      testItem,
      {
        outputDir: SANDBOX_DIR,
        downloadMedia: false,
        customTranscribe: async () => "认知重塑与心智模型构建的语音转录测试文本",
      },
      undefined,
      "认知存档"
    );

    assert.equal(outcome.title, "认知重塑与心智模型构建");
    const subCardPath = join(SANDBOX_DIR, "douyin", "认知存档", "认知重塑与心智模型构建.md");
    const parsed = await readMarkdownFile(subCardPath);
    assert.equal(parsed.data.title, "认知重塑与心智模型构建");
    assert.equal(parsed.data.entry, "douyin-sync");
  });

  await t.test("Task 2.9: DouyinPipeline syncCollections routes awemes into corresponding folderName subdirectories", async () => {
    const mockTransport = async (path: string, params?: Record<string, unknown>) => {
      if (path.includes("/aweme/v1/web/collects/list/")) {
        return {
          status_code: 0,
          collects_list: [
            { collects_id: "col_ai", collects_name: "AI存档", total_number: 1 },
          ],
          has_more: 0,
          cursor: 0,
        };
      }
      if (path.includes("/aweme/v1/web/collects/video/list/")) {
        return {
          status_code: 0,
          aweme_list: [
            {
              aweme_id: "7300000006",
              desc: "大型语言模型原理与实践",
              aweme_type: 4,
              author: {
                uid: "u600",
                sec_uid: "sec_u600",
                nickname: "AI导师",
              },
              create_time: 1730333300,
            },
          ],
          has_more: 0,
          cursor: 1,
        };
      }
      return {};
    };

    const results = await syncCollections({
      outputDir: SANDBOX_DIR,
      downloadMedia: false,
      sqlitePath: DB_PATH,
      customTransport: mockTransport,
      customTranscribe: async () => "大型语言模型原理与实践语音转录文本",
    });

    assert.equal(results.length, 1);
    const subCardPath = join(SANDBOX_DIR, "douyin", "AI存档", "大型语言模型原理与实践.md");
    const parsed = await readMarkdownFile(subCardPath);
    assert.equal(parsed.data.title, "大型语言模型原理与实践");

    // 验证断点检查点已保存
    const checkDb = openReconcilerDb(DB_PATH);
    const cp = getCheckpoint(checkDb, "collect", "col_ai");
    closeReconcilerDb(checkDb);
    assert.ok(cp);
    assert.equal(cp.lastCursor, 0); // has_more: 0 重置为 0 循环游标待下次新作品
  });

  await t.test("Task 2.10: fetchAwemeDetailWithTranscript extracts aweme and transcript correctly", async () => {
    const mockTransport = async (path: string, params?: Record<string, unknown>) => {
      if (path.includes("/aweme/v1/web/aweme/detail/")) {
        return {
          status_code: 0,
          aweme_detail: {
            aweme_id: "7300000007",
            desc: "单条测试视频",
            aweme_type: 4,
            video: {
              play_addr: { url_list: ["https://example.com/play.mp4"] },
            },
            author: {
              uid: "u700",
              sec_uid: "sec_u700",
              nickname: "灵感创作者",
            },
            create_time: 1730333400,
          },
        };
      }
      return {};
    };

    const data = await fetchAwemeDetailWithTranscript("https://www.douyin.com/video/7300000007", {
      customTransport: mockTransport,
      customTranscribe: async () => "这是单条视频的语音转录测试文本",
    });

    assert.equal(data.aweme.id, "7300000007");
    assert.equal(data.aweme.author.nickname, "灵感创作者");
    assert.equal(data.transcript, "这是单条视频的语音转录测试文本");
  });

  await t.test("Task 2.11: 验证串行执行队列 (Serial Queue Execution) 杜绝并发打崩 ASR", async () => {
    let activeWorkers = 0;
    let maxConcurrent = 0;
    const processOrder: string[] = [];

    const mockTransport = async (path: string) => {
      if (path.includes("/aweme/v1/web/collects/list/")) {
        return {
          status_code: 0,
          collects_list: [
            { collects_id: "col_serial", collects_name: "串行测试夹", total_number: 3 },
          ],
          has_more: 0,
          cursor: 0,
        };
      }
      if (path.includes("/aweme/v1/web/collects/video/list/")) {
        return {
          status_code: 0,
          aweme_list: [
            {
              aweme_id: "serial_1",
              desc: "视频一",
              aweme_type: 4,
              author: { uid: "u1", sec_uid: "s1", nickname: "作者1" },
            },
            {
              aweme_id: "serial_2",
              desc: "视频二",
              aweme_type: 4,
              author: { uid: "u2", sec_uid: "s2", nickname: "作者2" },
            },
            {
              aweme_id: "serial_3",
              desc: "视频三",
              aweme_type: 4,
              author: { uid: "u3", sec_uid: "s3", nickname: "作者3" },
            },
          ],
          has_more: 0,
          cursor: 3,
        };
      }
      return {};
    };

    const mockTranscribe = async (source: string) => {
      activeWorkers++;
      maxConcurrent = Math.max(maxConcurrent, activeWorkers);
      await sleep(25);
      activeWorkers--;
      processOrder.push(source);
      return `转录完成: ${source}`;
    };

    const results = await syncCollections(
      {
        outputDir: SANDBOX_DIR,
        downloadMedia: false,
        collectId: "col_serial",
        customTransport: mockTransport,
        customTranscribe: mockTranscribe,
      },
      "col_serial"
    );

    assert.equal(results.length, 3);
    assert.equal(maxConcurrent, 1, "最大并发执行数必须严格为 1，严禁 Promise.all 并发打崩 ASR");
    assert.equal(processOrder.length, 3);
  });

  await t.test("Task 2.12: 验证批次上限配额控制 (Batch Quota / batchSize)", async () => {
    const quotaDbPath = join(SANDBOX_DIR, "quota_test.db");
    const mockTransport = async (path: string, params?: Record<string, unknown>) => {
      if (path.includes("/aweme/v1/web/collects/list/")) {
        return {
          status_code: 0,
          collects_list: [
            { collects_id: "col_quota", collects_name: "配额测试夹", total_number: 4 },
          ],
          has_more: 0,
          cursor: 0,
        };
      }
      if (path.includes("/aweme/v1/web/collects/video/list/")) {
        return {
          status_code: 0,
          aweme_list: [
            {
              aweme_id: "quota_1",
              desc: "配额作品1",
              aweme_type: 4,
              author: { uid: "u1", sec_uid: "s1", nickname: "作者1" },
            },
            {
              aweme_id: "quota_2",
              desc: "配额作品2",
              aweme_type: 4,
              author: { uid: "u2", sec_uid: "s2", nickname: "作者2" },
            },
            {
              aweme_id: "quota_3",
              desc: "配额作品3",
              aweme_type: 4,
              author: { uid: "u3", sec_uid: "s3", nickname: "作者3" },
            },
            {
              aweme_id: "quota_4",
              desc: "配额作品4",
              aweme_type: 4,
              author: { uid: "u4", sec_uid: "s4", nickname: "作者4" },
            },
          ],
          has_more: 0,
          cursor: 4,
        };
      }
      return {};
    };

    // 第一批次：限制 batchSize = 2，共 4 件待同步，仅消费前 2 件
    const batch1 = await syncCollections(
      {
        outputDir: SANDBOX_DIR,
        downloadMedia: false,
        sqlitePath: quotaDbPath,
        collectId: "col_quota",
        batchSize: 2,
        customTransport: mockTransport,
        customTranscribe: async () => "转录成功",
      },
      "col_quota"
    );

    assert.equal(batch1.length, 2);
    assert.equal(batch1[0].metadata?.awemeId, "quota_1");
    assert.equal(batch1[1].metadata?.awemeId, "quota_2");

    // 检查点游标安全推进：因为还有 2 件未消费，游标不应跳过未消费项
    const checkDb1 = openReconcilerDb(quotaDbPath);
    const cp1 = getCheckpoint(checkDb1, "collect", "col_quota");
    assert.equal(cp1?.lastCursor, 0); // 游标停留在原处以便下次继续消费
    assert.equal(isSynced(checkDb1, "quota_1"), true);
    assert.equal(isSynced(checkDb1, "quota_2"), true);
    assert.equal(isSynced(checkDb1, "quota_3"), false);
    assert.equal(isSynced(checkDb1, "quota_4"), false);
    closeReconcilerDb(checkDb1);

    // 第二批次：再次运行 batchSize = 2，消费剩余 2 件
    const batch2 = await syncCollections(
      {
        outputDir: SANDBOX_DIR,
        downloadMedia: false,
        sqlitePath: quotaDbPath,
        collectId: "col_quota",
        batchSize: 2,
        customTransport: mockTransport,
        customTranscribe: async () => "转录成功",
      },
      "col_quota"
    );

    assert.equal(batch2.length, 2);
    assert.equal(batch2[0].metadata?.awemeId, "quota_3");
    assert.equal(batch2[1].metadata?.awemeId, "quota_4");

    // 第三批次：已全部同步，返回 0 件
    const batch3 = await syncCollections(
      {
        outputDir: SANDBOX_DIR,
        downloadMedia: false,
        sqlitePath: quotaDbPath,
        collectId: "col_quota",
        batchSize: 2,
        customTransport: mockTransport,
      },
      "col_quota"
    );
    assert.equal(batch3.length, 0);
  });

  await t.test("Task 2.13: 验证单件转录失败跳过落盘，且未对账标记，Ghost 绝对纯洁 (Zero-Dirty-Card)", async () => {
    const zeroDirtyDbPath = join(SANDBOX_DIR, "zero_dirty_test.db");
    const mockTransport = async (path: string) => {
      if (path.includes("/aweme/v1/web/collects/list/")) {
        return {
          status_code: 0,
          collects_list: [
            { collects_id: "col_zero", collects_name: "纯洁夹", total_number: 2 },
          ],
          has_more: 0,
          cursor: 0,
        };
      }
      if (path.includes("/aweme/v1/web/collects/video/list/")) {
        return {
          status_code: 0,
          aweme_list: [
            {
              aweme_id: "fail_transcribe_item",
              desc: "转录失败的作品",
              aweme_type: 4,
              author: { uid: "u8", sec_uid: "s8", nickname: "创作者A" },
            },
            {
              aweme_id: "success_item",
              desc: "转录成功的作品",
              aweme_type: 4,
              author: { uid: "u9", sec_uid: "s9", nickname: "创作者B" },
            },
          ],
          has_more: 0,
          cursor: 2,
        };
      }
      return {};
    };

    const mockTranscribe = async (source: string) => {
      if (source.includes("fail_transcribe_item")) {
        return undefined; // 模拟失败
      }
      return "这是成功作品的转录文字稿";
    };

    const results = await syncCollections(
      {
        outputDir: SANDBOX_DIR,
        downloadMedia: false,
        sqlitePath: zeroDirtyDbPath,
        collectId: "col_zero",
        customTransport: mockTransport,
        customTranscribe: mockTranscribe,
      },
      "col_zero"
    );

    // 只有成功的作品被摄入，失败的被跳过
    assert.equal(results.length, 1);
    assert.equal(results[0].metadata?.awemeId, "success_item");

    const checkDb = openReconcilerDb(zeroDirtyDbPath);
    try {
      // 成功作品已落盘并在 db 对账
      assert.equal(isSynced(checkDb, "success_item"), true);
      const successCard = join(SANDBOX_DIR, "douyin", "纯洁夹", "转录成功的作品.md");
      assert.equal(existsSync(successCard), true);

      // 失败作品绝未在 db 对账，且 Ghost 目录绝对无脏卡片
      assert.equal(isSynced(checkDb, "fail_transcribe_item"), false);
      const failCard = join(SANDBOX_DIR, "douyin", "纯洁夹", "转录失败的作品.md");
      assert.equal(existsSync(failCard), false, "失败作品绝不写入 Ghost 知识库");
    } finally {
      closeReconcilerDb(checkDb);
    }
  });

  await t.test("Task 2.14: 验证失败作品下次同步依然被 filterUnsynced 识别，天然支持无限自动重试", async () => {
    const retryDbPath = join(SANDBOX_DIR, "retry_test.db");
    const checkDb = openReconcilerDb(retryDbPath);

    try {
      const testItem: DouyinAwemeItem = {
        id: "retry_aweme_001",
        desc: "需自动重试的视频作品",
        author: { uid: "u10", secUid: "s10", nickname: "少佐" },
        createTime: 1730500200,
        mediaType: "video",
        shareUrl: "https://www.douyin.com/video/retry_aweme_001",
      };

      // 1. 模拟初次因 ASR 服务不可达失败
      await assert.rejects(
        async () => {
          await processAweme(
            testItem,
            {
              outputDir: SANDBOX_DIR,
              downloadMedia: false,
              customTranscribe: async () => undefined,
            },
            checkDb
          );
        },
        /视频语音转录失败或结果为空/
      );

      // 验证未对账
      assert.equal(isSynced(checkDb, "retry_aweme_001"), false);

      // 2. 检查 filterUnsynced：由于未在 db 标记对账，它天然被识别为未同步
      const unsynced = filterUnsynced(checkDb, [testItem], SANDBOX_DIR);
      assert.equal(unsynced.length, 1);
      assert.equal(unsynced[0].id, "retry_aweme_001");

      // 3. 第二次同步（ASR 自愈或重试成功）
      const retryOutcome = await processAweme(
        testItem,
        {
          outputDir: SANDBOX_DIR,
          downloadMedia: false,
          customTranscribe: async () => "网络恢复后重试成功的语音转录文字稿",
        },
        checkDb
      );

      assert.equal(retryOutcome.title, "需自动重试的视频作品");
      assert.equal(isSynced(checkDb, "retry_aweme_001"), true);

      // 4. 成功后 filterUnsynced 不再返回该项
      const afterSuccess = filterUnsynced(checkDb, [testItem], SANDBOX_DIR);
      assert.equal(afterSuccess.length, 0);
    } finally {
      closeReconcilerDb(checkDb);
    }
  });

  // 清理沙盒
  await rm(SANDBOX_DIR, { recursive: true, force: true });
});
