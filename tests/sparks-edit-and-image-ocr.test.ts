import test from "node:test";
import assert from "node:assert/strict";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "pathe";
import {
  openSparksDb,
  closeSparksDb,
  createSpark,
  getSparkById,
  updateSpark,
  deleteSpark,
  searchSparks,
  refineSparkInput,
  transcribeImageWithLLM,
  getMimeTypeFromExt,
} from "@tachikoma/core";
import { Command, registerSparkCommands } from "@tachikoma/cli";

const SANDBOX_DIR = join(process.cwd(), "tests/sandbox/sparks-edit-ocr-test");
const DB_FILE_PATH = join(SANDBOX_DIR, "sparks.db");
const ASSETS_DIR = join(SANDBOX_DIR, "assets");

test("Tachikoma Tactical Sparks: Edit, Rm & Vision Transcription Tests", async (suite) => {
  await rm(SANDBOX_DIR, { recursive: true, force: true });
  await mkdir(SANDBOX_DIR, { recursive: true });
  await mkdir(ASSETS_DIR, { recursive: true });

  const fakeJpgPath = join(SANDBOX_DIR, "test_card.jpg");
  await writeFile(fakeJpgPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));

  const fakePdfPath = join(SANDBOX_DIR, "document.pdf");
  await writeFile(fakePdfPath, "%PDF-1.4 fake pdf content");

  suite.after(async () => {
    await rm(SANDBOX_DIR, { recursive: true, force: true });
  });

  // =========================================================================
  // 1. Core DB Layer: updateSpark & FTS5 Trigger Sync
  // =========================================================================
  await suite.test("updateSpark modifies record and syncs sparks_fts index", () => {
    const db = openSparksDb(":memory:");

    const initial = createSpark(db, {
      title: "原始标题",
      content: "最初的灵感内容包含关键词旧内容",
      tags: ["#初始"],
      type: "fleeting",
      cluster: "sparks",
      status: "seed",
    });

    assert.equal(initial.title, "原始标题");
    assert.equal(initial.status, "seed");

    // 验证初始 FTS 可搜到
    const hitsBefore = searchSparks(db, "旧内容");
    assert.equal(hitsBefore.length, 1);
    assert.equal(hitsBefore[0].id, initial.id);

    // 修改标题、正文和标签
    const updated = updateSpark(db, initial.id, {
      title: "修改后的标题",
      content: "全新修改后的正文包含搜索标靶超凡脱俗",
      tags: ["#更新", "#进化"],
      status: "growing",
      type: "quote",
      cluster: "literature",
    });

    assert.ok(updated);
    assert.equal(updated.title, "修改后的标题");
    assert.equal(updated.content, "全新修改后的正文包含搜索标靶超凡脱俗");
    assert.equal(updated.status, "growing");
    assert.equal(updated.type, "quote");
    assert.equal(updated.cluster, "literature");
    assert.deepEqual(updated.tags, ["#更新", "#进化"]);

    // 验证 FTS5 触发器：新内容可被全文检索命中
    const hitsNew = searchSparks(db, "超凡脱俗");
    assert.equal(hitsNew.length, 1);
    assert.equal(hitsNew[0].id, initial.id);

    // 验证旧词不再命中
    const hitsOld = searchSparks(db, "旧内容");
    assert.equal(hitsOld.length, 0);

    closeSparksDb(db);
  });

  // =========================================================================
  // 2. Core DB Layer: deleteSpark
  // =========================================================================
  await suite.test("deleteSpark removes record and verifies null return", () => {
    const db = openSparksDb(":memory:");

    const record = createSpark(db, {
      title: "待删除灵感",
      content: "该条记录即将被删除测试",
      tags: ["#临时"],
      type: "fleeting",
      status: "seed",
    });

    assert.ok(getSparkById(db, record.id));

    // 执行删除
    const success = deleteSpark(db, record.id);
    assert.equal(success, true);

    // 确认已不存在
    assert.equal(getSparkById(db, record.id), null);

    // 确认 FTS5 已同步移除
    const hits = searchSparks(db, "即将被删除测试");
    assert.equal(hits.length, 0);

    // 重复删除返回 false
    assert.equal(deleteSpark(db, record.id), false);

    closeSparksDb(db);
  });

  // =========================================================================
  // 3. Vision Transcription & MIME Mapping
  // =========================================================================
  await suite.test("MIME type helper maps extensions with jpeg fallback", () => {
    assert.equal(getMimeTypeFromExt(".jpg"), "image/jpeg");
    assert.equal(getMimeTypeFromExt(".jpeg"), "image/jpeg");
    assert.equal(getMimeTypeFromExt(".png"), "image/png");
    assert.equal(getMimeTypeFromExt(".webp"), "image/webp");
    assert.equal(getMimeTypeFromExt(".gif"), "image/gif");
    assert.equal(getMimeTypeFromExt(".bmp"), "image/bmp");
    assert.equal(getMimeTypeFromExt(".unknown"), "image/jpeg");
  });

  await suite.test("refineSparkInput with stub imageTranscriber extracts text and title", async () => {
    const sampleOcrText = "人生若只如初见，何事秋风悲画扇 —— 纳兰性德";

    const result = await refineSparkInput(fakeJpgPath, {
      assetsDir: ASSETS_DIR,
      imageTranscriber: async () => sampleOcrText,
    });

    assert.equal(result.type, "meme");
    assert.equal(result.content, sampleOcrText);
    assert.ok(result.title.includes("人生若只如初见"));
    assert.ok(result.title.includes("纳兰性德"));
    assert.ok(result.assetPath?.includes("test_card.jpg"));
    assert.ok(result.tags?.includes("#梗图"));
  });

  await suite.test("refineSparkInput preserves user-specified title when transcribing", async () => {
    const result = await refineSparkInput(fakeJpgPath, {
      assetsDir: ASSETS_DIR,
      title: "用户指定图文标题",
      imageTranscriber: async () => "画面提取的一段话",
    });

    assert.equal(result.title, "用户指定图文标题");
    assert.equal(result.content, "画面提取的一段话");
  });

  await suite.test("refineSparkInput degrades to fileName when imageTranscriber returns empty string", async () => {
    const result = await refineSparkInput(fakeJpgPath, {
      assetsDir: ASSETS_DIR,
      imageTranscriber: async () => "",
    });

    assert.equal(result.content, "test_card.jpg");
    assert.equal(result.title, "梗图: test_card");
    assert.equal(result.type, "meme");
  });

  await suite.test("refineSparkInput gracefully degrades when imageTranscriber throws", async () => {
    const result = await refineSparkInput(fakeJpgPath, {
      assetsDir: ASSETS_DIR,
      imageTranscriber: async () => {
        throw new Error("Gateway 503 Service Unavailable");
      },
    });

    assert.equal(result.content, "test_card.jpg");
    assert.equal(result.title, "梗图: test_card");
    assert.equal(result.type, "meme");
  });

  await suite.test("refineSparkInput leaves non-image files untouched without transcribing", async () => {
    let transcriberCalled = false;
    const result = await refineSparkInput(fakePdfPath, {
      assetsDir: ASSETS_DIR,
      imageTranscriber: async () => {
        transcriberCalled = true;
        return "不应执行转录";
      },
    });

    assert.equal(transcriberCalled, false);
    assert.equal(result.type, "fleeting");
    assert.equal(result.title, "document.pdf");
    assert.equal(result.content, "document.pdf");
  });

  // =========================================================================
  // 4. transcribeImageWithLLM unit tests with customFetcher
  // =========================================================================
  await suite.test("transcribeImageWithLLM posts OpenAI multimodal format and parses response", async () => {
    let capturedBody: any = null;

    const mockVisionFetcher: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: "落霞与孤鹜齐飞，秋水共长天一色",
              },
            },
          ],
        }),
      } as unknown as Response;
    };

    const text = await transcribeImageWithLLM("data:image/jpeg;base64,ZmFrZQ==", {
      customFetcher: mockVisionFetcher,
      baseUrl: "http://127.0.0.1:9999/v1",
      apiKey: "test-key",
      model: "test-vision-model",
    });

    assert.equal(text, "落霞与孤鹜齐飞，秋水共长天一色");
    assert.equal(capturedBody.model, "test-vision-model");
    assert.equal(capturedBody.temperature, 0);
    assert.equal(capturedBody.messages[0].role, "user");
    assert.equal(capturedBody.messages[0].content[0].type, "text");
    assert.equal(capturedBody.messages[0].content[1].type, "image_url");
    assert.equal(
      capturedBody.messages[0].content[1].image_url.url,
      "data:image/jpeg;base64,ZmFrZQ=="
    );
  });

  await suite.test("transcribeImageWithLLM returns empty string on gateway failure", async () => {
    const mockFailingFetcher: typeof fetch = async () => {
      return {
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as unknown as Response;
    };

    const text = await transcribeImageWithLLM("data:image/jpeg;base64,ZmFrZQ==", {
      customFetcher: mockFailingFetcher,
    });

    assert.equal(text, "");
  });

  await suite.test("transcribeImageWithLLM returns empty string for empty input or network throw", async () => {
    assert.equal(await transcribeImageWithLLM(""), "");
    assert.equal(await transcribeImageWithLLM("   "), "");

    const mockThrowFetcher: typeof fetch = async () => {
      throw new Error("Network connection reset");
    };

    const text = await transcribeImageWithLLM("data:image/jpeg;base64,ZmFrZQ==", {
      customFetcher: mockThrowFetcher,
    });
    assert.equal(text, "");
  });

  // =========================================================================
  // 5. CLI edit & rm Subcommands End-to-End
  // =========================================================================
  await suite.test("CLI edit subcommand modifies record in database", async () => {
    const db = openSparksDb(DB_FILE_PATH);
    const spark = createSpark(db, {
      title: "待编辑的条目",
      content: "初始内容",
      tags: ["#待办"],
      type: "fleeting",
      status: "seed",
    });
    closeSparksDb(db);

    const program = new Command();
    program.name("tachikoma");
    registerSparkCommands(program);

    await program.parseAsync([
      "node",
      "tachikoma",
      "spark",
      "edit",
      spark.id,
      "-t",
      "编辑后的全新标题",
      "-c",
      "编辑后的正文内容",
      "--tags",
      "重构",
      "#精进",
      "--type",
      "quote",
      "--cluster",
      "literature",
      "--status",
      "growing",
      "--db",
      DB_FILE_PATH,
    ]);

    const verifyDb = openSparksDb(DB_FILE_PATH);
    const updated = getSparkById(verifyDb, spark.id);
    closeSparksDb(verifyDb);

    assert.ok(updated);
    assert.equal(updated.title, "编辑后的全新标题");
    assert.equal(updated.content, "编辑后的正文内容");
    assert.equal(updated.type, "quote");
    assert.equal(updated.cluster, "literature");
    assert.equal(updated.status, "growing");
    assert.ok(updated.tags.includes("#重构"));
    assert.ok(updated.tags.includes("#精进"));
  });

  await suite.test("CLI edit prints help without crashing when no editable options provided", async () => {
    const program = new Command();
    program.name("tachikoma");
    registerSparkCommands(program);

    let helpPrinted = false;
    const originalStdout = process.stdout.write;
    process.stdout.write = ((chunk: any) => {
      if (typeof chunk === "string" && chunk.includes("Usage:")) {
        helpPrinted = true;
      }
      return true;
    }) as any;

    try {
      await program.parseAsync([
        "node",
        "tachikoma",
        "spark",
        "edit",
        "some-id",
        "--db",
        DB_FILE_PATH,
      ]);
    } finally {
      process.stdout.write = originalStdout;
    }

    assert.equal(helpPrinted, true);
  });

  await suite.test("CLI rm subcommand deletes record from database", async () => {
    const db = openSparksDb(DB_FILE_PATH);
    const spark = createSpark(db, {
      title: "即将通过CLI删除",
      content: "删除正文",
      tags: ["#待删"],
      type: "fleeting",
      status: "seed",
    });
    closeSparksDb(db);

    const program = new Command();
    program.name("tachikoma");
    registerSparkCommands(program);

    await program.parseAsync([
      "node",
      "tachikoma",
      "spark",
      "rm",
      spark.id,
      "--db",
      DB_FILE_PATH,
    ]);

    const verifyDb = openSparksDb(DB_FILE_PATH);
    assert.equal(getSparkById(verifyDb, spark.id), null);
    closeSparksDb(verifyDb);
  });

  await suite.test("CLI rm reports error and sets exitCode for non-existing id", async () => {
    const program = new Command();
    program.name("tachikoma");
    registerSparkCommands(program);

    const originalExitCode = process.exitCode;
    process.exitCode = 0;

    const errors: string[] = [];
    const originalErr = console.error;
    console.error = (...args: unknown[]) => errors.push(args.join(" "));

    try {
      await program.parseAsync([
        "node",
        "tachikoma",
        "spark",
        "rm",
        "non-existing-uuid-12345",
        "--db",
        DB_FILE_PATH,
      ]);
    } finally {
      console.error = originalErr;
    }

    assert.equal(process.exitCode, 1);
    assert.ok(errors.some((e) => e.includes("未找到 ID 为")));

    process.exitCode = originalExitCode;
  });
});
