import test from "node:test";
import assert from "node:assert/strict";
import { rm, mkdir } from "node:fs/promises";
import { join } from "pathe";
import {
  fetchPublicAwemeItem,
  extractDouyinUrlOrId,
  fetchAwemeDetailWithTranscript,
  DouyinAwemeItem,
} from "@tachikoma/douyin-sync";
import {
  extractContentSummary,
  ingestDouyinToSparks,
} from "@tachikoma/cli";
import { openSparksDb, closeSparksDb, getSparkById } from "@tachikoma/core";

const SANDBOX_DIR = join(process.cwd(), "tests/sandbox/public-douyin-ocr-test");
const DB_PATH = join(SANDBOX_DIR, "sparks.db");

test("Public Douyin Anonymous Extraction & Gallery OCR Pipeline Tests", async (t) => {
  await rm(SANDBOX_DIR, { recursive: true, force: true });
  await mkdir(SANDBOX_DIR, { recursive: true });

  t.after(async () => {
    await rm(SANDBOX_DIR, { recursive: true, force: true });
  });

  await t.test("extractDouyinUrlOrId extracts awemeId and URL across diverse formats", () => {
    // 1. 标准视频与图集链接
    const video = extractDouyinUrlOrId("https://www.douyin.com/video/7401234567890123456");
    assert.equal(video.awemeId, "7401234567890123456");
    assert.equal(video.url, "https://www.douyin.com/video/7401234567890123456");

    const note = extractDouyinUrlOrId("https://www.douyin.com/note/7409876543210987654");
    assert.equal(note.awemeId, "7409876543210987654");

    // 2. 短链接与带分享口令的剪贴板文本
    const clipboard = extractDouyinUrlOrId(
      "7.21 复制打开抖音，看看【攻壳机动队的作品】 https://v.douyin.com/iRkLmnP/ 03/12 d@s.GM :3pm"
    );
    assert.equal(clipboard.url, "https://v.douyin.com/iRkLmnP/");

    // 3. 纯数字 ID
    const pureId = extractDouyinUrlOrId("7401234567890123456");
    assert.equal(pureId.awemeId, "7401234567890123456");
  });

  await t.test("fetchPublicAwemeItem normalizes gallery and video anonymously without cookies", async () => {
    const mockPublicGallery: DouyinAwemeItem = {
      id: "7405555555",
      desc: "攻壳机动队视觉原画公开集",
      author: {
        uid: "u_motoko",
        secUid: "sec_motoko",
        nickname: "草薙素子",
      },
      createTime: 1730419200,
      mediaType: "gallery",
      imageUrls: [
        "https://example.com/slide_1.jpg",
        "https://example.com/slide_2.jpg",
      ],
      shareUrl: "https://www.douyin.com/video/7405555555",
    };

    const result = await fetchPublicAwemeItem("https://v.douyin.com/iRkLmnP/", {
      customExtractor: async () => mockPublicGallery,
    });

    assert.equal(result.id, "7405555555");
    assert.equal(result.mediaType, "gallery");
    assert.equal(result.author.nickname, "草薙素子");
    assert.equal(result.imageUrls?.length, 2);
  });

  await t.test("fetchAwemeDetailWithTranscript prioritizes public extractor and executes gallery OCR", async () => {
    let ocrExecuted = false;

    const data = await fetchAwemeDetailWithTranscript("https://www.douyin.com/note/7406666666", {
      customExtractor: async () => ({
        id: "7406666666",
        desc: "架构师的思考模型图解",
        author: {
          uid: "u_arch",
          secUid: "sec_arch",
          nickname: "巴特",
        },
        createTime: 1730420000,
        mediaType: "gallery",
        imageUrls: [
          "https://example.com/arch1.jpg",
          "https://example.com/arch2.jpg",
        ],
        shareUrl: "https://www.douyin.com/note/7406666666",
      }),
      customOcr: async (images) => {
        ocrExecuted = true;
        assert.equal(images.length, 2);
        return "### 第 1 张 / 共 2 张\n\n架构设计三原则：契约第一、工具库优先、源头治理。\n\n### 第 2 张 / 共 2 张\n\n去AI味内生守则：单句痛点直给，杜绝套路排比。";
      },
    });

    assert.ok(ocrExecuted);
    assert.equal(data.aweme.id, "7406666666");
    assert.equal(data.aweme.mediaType, "gallery");
    assert.ok(data.ocrContent?.includes("架构设计三原则"));
    assert.ok(data.ocrContent?.includes("去AI味内生守则"));
  });

  await t.test("extractContentSummary purifies OCR markdown and distills high-density key points", () => {
    const rawOcrText = `
### 第 1 张 / 共 3 张

架构设计第一性原理：
1. 库优先于手搓，依托 pathe 与 radash；
2. 强类型契约依托 TypeBox，杜绝防御八股；

### 第 2 张 / 共 3 张

【无文字】

### 第 3 张 / 共 3 张

3. 交付红线：未经拍板绝不擅自 git push。
`;

    const { summary, keyPoints } = extractContentSummary(rawOcrText, { maxPoints: 5 });

    assert.ok(summary.length > 0);
    assert.ok(!summary.includes("### 第 1 张"));
    assert.ok(!summary.includes("【无文字】"));
    assert.ok(keyPoints.length >= 2);
    assert.ok(keyPoints.some((p) => p.includes("库优先于手搓")));
    assert.ok(keyPoints.some((p) => p.includes("交付红线")));
  });

  await t.test("ingestDouyinToSparks end-to-end persists gallery OCR into sparks.db with high-density receipt", async () => {
    const result = await ingestDouyinToSparks("https://www.douyin.com/note/7407777777", {
      sparksDbPath: DB_PATH,
      customExtractor: async () => ({
        id: "7407777777",
        desc: "攻壳特遣队：战术灵感图册",
        author: {
          uid: "u_tachi",
          secUid: "sec_tachi",
          nickname: "塔奇克马",
        },
        createTime: 1730421000,
        mediaType: "gallery",
        imageUrls: ["https://example.com/p1.jpg", "https://example.com/p2.jpg"],
        shareUrl: "https://www.douyin.com/note/7407777777",
      }),
      customOcr: async () =>
        "### 第 1 张 / 共 2 张\n\n自律思考回路与第二大脑持续同步。\n\n### 第 2 张 / 共 2 张\n\n多模态图集全量 OCR 提纯入库军械库。",
    });

    assert.ok(result.record.id);
    assert.equal(result.record.title, "攻壳特遣队：战术灵感图册");
    assert.equal(result.record.type, "fleeting");
    assert.ok(result.record.tags.includes("#抖音"));
    assert.ok(result.record.tags.includes("#图集"));
    assert.ok(result.record.tags.includes("#塔奇克马"));
    assert.ok(result.record.content.includes("🖼️ OCR转录:"));
    assert.ok(result.record.content.includes("自律思考回路与第二大脑持续同步"));
    assert.ok(result.summary);
    assert.ok(result.keyPoints && result.keyPoints.length > 0);

    // 验证 SQLite 持久化
    const db = openSparksDb(DB_PATH);
    const stored = getSparkById(db, result.record.id);
    closeSparksDb(db);

    assert.ok(stored);
    assert.equal(stored?.id, result.record.id);
    assert.ok(stored?.content.includes("多模态图集全量 OCR 提纯入库军械库"));
  });
});
