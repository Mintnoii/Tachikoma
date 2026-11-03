import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
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

  await t.test("Task 2.6: DouyinPipeline video fallback to item.desc when transcript is absent", async () => {
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

      const outcome = await processAweme(
        testVideoItem,
        {
          outputDir: SANDBOX_DIR,
          downloadMedia: false,
          // 未提供 customTranscribe
        },
        db
      );

      assert.equal(outcome.title, "无转录文本仅有描述的作品");
      assert.equal(outcome.mediaType, "video");

      const cardPath = join(SANDBOX_DIR, "douyin", "无转录文本仅有描述的作品.md");
      const parsed = await readMarkdownFile(cardPath);
      assert.ok(parsed.body.includes("## 转录内容 / Notes"));
      assert.ok(parsed.body.includes("无转录文本仅有描述的作品"));
    } finally {
      closeReconcilerDb(db);
    }
  });

  await t.test("Task 2.7: DouyinPipeline video fallback to placeholder when transcript and desc are empty", async () => {
    const testVideoItem: DouyinAwemeItem = {
      id: "7300000004",
      desc: "",
      author: {
        uid: "u400",
        secUid: "sec_u400",
        nickname: "荒卷大辅",
      },
      createTime: 1730333100,
      mediaType: "video",
      shareUrl: "https://www.douyin.com/video/7300000004",
    };

    const outcome = await processAweme(
      testVideoItem,
      {
        outputDir: SANDBOX_DIR,
        downloadMedia: false,
        customTranscribe: async () => "   ", // 空白字符
      }
    );

    assert.equal(outcome.title, "抖音作品_7300000004");
    assert.ok(outcome.content.includes("## 转录内容 / Notes"));
    assert.ok(outcome.content.includes("（原作者未填写文案描述）"));
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

  // 清理沙盒
  await rm(SANDBOX_DIR, { recursive: true, force: true });
});
