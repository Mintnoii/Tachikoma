import test from "node:test";
import assert from "node:assert/strict";
import { rm, mkdir } from "node:fs/promises";
import { join } from "pathe";
import { existsSync } from "node:fs";
import { program, ingestDouyinToSparks } from "@tachikoma/cli";
import { openSparksDb, closeSparksDb, getSparkById } from "@tachikoma/core";

const SANDBOX_DIR = join(process.cwd(), "tests/sandbox/cli-douyin-test");
const DB_PATH = join(SANDBOX_DIR, "sparks.db");
const GHOST_RAW_DIR = join(SANDBOX_DIR, "Ghost/_raw");

test("Phase 4: Tachikoma CLI Interface Tests", async (t) => {
  await rm(SANDBOX_DIR, { recursive: true, force: true });
  await mkdir(SANDBOX_DIR, { recursive: true });

  t.after(async () => {
    await rm(SANDBOX_DIR, { recursive: true, force: true });
  });

  await t.test("CLI commands and options definition", () => {
    assert.equal(program.name(), "tachikoma");
    const commands = program.commands.map((c) => c.name());
    assert.ok(commands.includes("capture") || commands.includes("ingest"));
    assert.ok(commands.includes("sync"));
    assert.ok(commands.includes("spark"));
  });

  await t.test("ingestDouyinToSparks stores single Douyin video into sparks.db without polluting Ghost", async () => {
    const mockTransport = async (path: string, params?: Record<string, unknown>) => {
      if (path.includes("/aweme/v1/web/aweme/detail/")) {
        return {
          status_code: 0,
          aweme_detail: {
            aweme_id: "7400000001",
            desc: "黑客帝国：数字母体与心智觉醒",
            aweme_type: 4,
            video: {
              play_addr: { url_list: ["https://example.com/matrix.mp4"] },
            },
            author: {
              uid: "u900",
              sec_uid: "sec_u900",
              nickname: "尼奥",
            },
            create_time: 1730334000,
          },
        };
      }
      return {};
    };

    const result = await ingestDouyinToSparks("https://www.douyin.com/video/7400000001", {
      sparksDbPath: DB_PATH,
      customTransport: mockTransport,
      customTranscribe: async () => "红药丸还是蓝药丸？觉醒从这里开始。",
    });

    assert.ok(result.record.id);
    assert.equal(result.record.title, "黑客帝国：数字母体与心智觉醒");
    assert.equal(result.record.type, "fleeting");
    assert.equal(result.record.status, "seed");
    assert.ok(result.record.tags.includes("#抖音"));
    assert.ok(result.record.tags.includes("#短视频"));
    assert.ok(result.record.tags.includes("#尼奥"));
    assert.ok(result.record.content.includes("红药丸还是蓝药丸？觉醒从这里开始。"));

    // 验证数据库中持久化成功
    const db = openSparksDb(DB_PATH);
    const stored = getSparkById(db, result.record.id);
    closeSparksDb(db);

    assert.ok(stored);
    assert.equal(stored?.id, result.record.id);
    assert.equal(stored?.title, "黑客帝国：数字母体与心智觉醒");

    // 绝对保证 Ghost 知识库未被污染
    assert.equal(existsSync(GHOST_RAW_DIR), false, "Ghost/_raw 不应生成任何目录或文件");
  });
});

