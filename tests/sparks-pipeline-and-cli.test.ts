import test from "node:test";
import assert from "node:assert/strict";
import { rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "pathe";
import matter from "gray-matter";
import {
  openSparksDb,
  closeSparksDb,
  getSparkById,
  querySparks,
  searchSparks,
  detectInputKind,
  extractUrlMetadata,
  processLocalAsset,
  distillText,
  distillWithLLM,
  fallbackDistillText,
  cleanJsonOutput,
  normalizeSparkCluster,
  normalizeGhostCluster,
  normalizeSparkType,
  normalizeSparkTags,
  refineSparkInput,
  refineAndCreateSpark,
  promoteSparkToGhost,
  sparkToIngestionResult,
} from "@tachikoma/core";
import { Command, registerSparkCommands, parseTagsInput, formatClusterLabel } from "@tachikoma/cli";

const SANDBOX_DIR = join(process.cwd(), "tests/sandbox/sparks-pipeline-test");
const DB_FILE_PATH = join(SANDBOX_DIR, "sparks.db");
const ASSETS_DIR = join(SANDBOX_DIR, "assets");
const GHOST_OUTPUT_DIR = join(SANDBOX_DIR, "Ghost/_raw");

test("Tachikoma Tactical Sparks: Pipeline, CLI & Ghost Promotion Comprehensive Tests", async (suite) => {
  // 测试前清理沙盒并建立基础目录
  await rm(SANDBOX_DIR, { recursive: true, force: true });
  await mkdir(SANDBOX_DIR, { recursive: true });
  await mkdir(ASSETS_DIR, { recursive: true });

  // 准备测试 fixture 文件
  const testImagePath = join(SANDBOX_DIR, "tachikoma_meme.png");
  await writeFile(testImagePath, "fake-png-binary-content", "utf-8");

  const testTextFilePath = join(SANDBOX_DIR, "notes.txt");
  await writeFile(testTextFilePath, "这是一份测试笔记文件", "utf-8");

  suite.after(async () => {
    await rm(SANDBOX_DIR, { recursive: true, force: true });
  });

  // =========================================================================
  // 阶段二：轻量提纯与解析管道测试 (Pipeline & Extractor)
  // =========================================================================
  await suite.test("Phase 2: Lightweight Pipeline & Extractor Tests", async (t) => {
    await t.test("detectInputKind accurately identifies input modalities", () => {
      assert.equal(detectInputKind("https://github.com/BurntSushi/ripgrep"), "url");
      assert.equal(detectInputKind("http://example.com/api"), "url");
      assert.equal(detectInputKind(testImagePath), "image");
      assert.equal(detectInputKind(testTextFilePath), "file");
      assert.equal(detectInputKind("生如夏花之绚烂，死如秋叶之静美 —— 泰戈尔"), "text");
      assert.equal(detectInputKind("pnpm add -D @sinclair/typebox #工具"), "text");
    });

    await t.test("extractUrlMetadata parses GitHub repository info with fallback", async () => {
      // 离线/兜底提取 (timeout 50ms)
      const metaFallback = await extractUrlMetadata("https://github.com/BurntSushi/ripgrep.git", undefined, 50);
      assert.equal(metaFallback.isGithub, true);
      assert.equal(metaFallback.title, "BurntSushi/ripgrep");
      assert.equal(metaFallback.type, "tool");
      assert.ok(metaFallback.tags.includes("#GitHub"));
      assert.ok(metaFallback.tags.includes("#工具"));

      // 模拟带有 Mock Fetch 的 GitHub 提取
      const mockFetch: typeof fetch = async () => {
        return {
          ok: true,
          status: 200,
          text: async () => `
            <html>
              <head>
                <title>GitHub - astral-sh/uv: An extremely fast Python package and project manager</title>
                <meta name="description" content="An extremely fast Python package and project manager, written in Rust.">
              </head>
            </html>
          `,
        } as unknown as Response;
      };

      const metaMocked = await extractUrlMetadata("https://github.com/astral-sh/uv", mockFetch);
      assert.equal(metaMocked.isGithub, true);
      assert.equal(metaMocked.title, "astral-sh/uv");
      assert.ok(metaMocked.description.includes("Python package"));
      assert.equal(metaMocked.type, "tool");
    });

    await t.test("extractUrlMetadata parses generic webpage metadata with fallback", async () => {
      const mockFetch: typeof fetch = async () => {
        return {
          ok: true,
          status: 200,
          text: async () => `
            <html>
              <head>
                <title>Hacker News</title>
                <meta name="description" content="Social news website focusing on computer science and entrepreneurship.">
              </head>
            </html>
          `,
        } as unknown as Response;
      };

      const meta = await extractUrlMetadata("https://news.ycombinator.com", mockFetch);
      assert.equal(meta.title, "Hacker News");
      assert.ok(meta.description.includes("Social news"));
      assert.ok(meta.tags.includes("#news"));
    });

    await t.test("processLocalAsset copies local image to assets directory", async () => {
      const result = await processLocalAsset(testImagePath, ASSETS_DIR);
      assert.equal(result.isImage, true);
      assert.equal(result.fileName, "tachikoma_meme.png");
      assert.equal(result.assetPath, join(ASSETS_DIR, "tachikoma_meme.png"));

      // 验证目标文件已物理存在
      const copiedContent = await readFile(result.assetPath, "utf-8");
      assert.equal(copiedContent, "fake-png-binary-content");
    });

    await t.test("processLocalAsset throws when file does not exist", async () => {
      await assert.rejects(
        () => processLocalAsset(join(SANDBOX_DIR, "ghost-404.png"), ASSETS_DIR),
        /本地资产文件不存在/
      );
    });

    await t.test("distillWithLLM parses one-shot JSON and aligns with Tachikoma 6+1 MOC clusters", async () => {
      const mockLLMFetch: typeof fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "感知命数，并在命运车轮碾过时尽量平静",
                    type: "quote",
                    cluster: "soul",
                    tags: ["#修行", "#内心平静"],
                  }),
                },
              },
            ],
          }),
        } as unknown as Response;
      };

      const result = await distillWithLLM("修行的作用是：略微感知自己的命数，并且在命运的车轮碾过自己时尽量平静", {
        customFetcher: mockLLMFetch,
      });

      assert.equal(result.title, "感知命数，并在命运车轮碾过时尽量平静");
      assert.equal(result.type, "quote");
      assert.equal(result.cluster, "soul");
      assert.deepEqual(result.tags, ["#修行", "#内心平静"]);
    });

    await t.test("distillWithLLM parses and identifies literature cluster for romantic literary quotes", async () => {
      const mockLiteratureFetch: typeof fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "从前慢，一生只够爱一个人 —— 木心",
                    type: "quote",
                    cluster: "literature",
                    tags: ["#唯美句子", "#浪漫", "#诗意"],
                  }),
                },
              },
            ],
          }),
        } as unknown as Response;
      };

      const quote = "从前的日色变得慢，车，马，邮件都慢，一生只够爱一个人 —— 木心《从前慢》";
      const result = await distillWithLLM(quote, {
        customFetcher: mockLiteratureFetch,
      });

      assert.equal(result.title, "从前慢，一生只够爱一个人 —— 木心");
      assert.equal(result.type, "quote");
      assert.equal(result.cluster, "literature");
      assert.deepEqual(result.tags, ["#唯美句子", "#浪漫", "#诗意"]);
    });

    await t.test("distillWithLLM parses and identifies life cluster for pourover coffee tasting notes", async () => {
      const mockLifeFetch: typeof fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "耶加雪菲水洗手冲咖啡风味随记",
                    type: "fleeting",
                    cluster: "life",
                    tags: ["#手冲咖啡", "#生活方式", "#松弛感"],
                  }),
                },
              },
            ],
          }),
        } as unknown as Response;
      };

      const coffeeNote = "今早手冲了一杯耶加雪菲水洗，92度水温，柑橘酸质明亮，尾段带着红茶般回甘，松弛感拉满。";
      const result = await distillWithLLM(coffeeNote, {
        customFetcher: mockLifeFetch,
      });

      assert.equal(result.title, "耶加雪菲水洗手冲咖啡风味随记");
      assert.equal(result.type, "fleeting");
      assert.equal(result.cluster, "life");
      assert.deepEqual(result.tags, ["#手冲咖啡", "#生活方式", "#松弛感"]);
    });

    await t.test("distillWithLLM strips markdown fences and normalizes tags and clusters", async () => {
      const mockFencedFetch: typeof fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: "```json\n{\n  \"title\": \"TypeBox 高性能模式校验\",\n  \"type\": \"tool\",\n  \"cluster\": \"tool\",\n  \"tags\": [\"TypeScript\", \"CLI\", \"工具\", \"冗余标签4\"]\n}\n```",
                },
              },
            ],
          }),
        } as unknown as Response;
      };

      const result = await distillWithLLM("pnpm add -D @sinclair/typebox", {
        customFetcher: mockFencedFetch,
      });

      assert.equal(result.title, "TypeBox 高性能模式校验");
      assert.equal(result.type, "tool");
      assert.equal(result.cluster, "arsenal"); // "tool" normalized to "arsenal"
      assert.equal(result.tags.length, 3); // Clamped to at most 3 tags
      assert.ok(result.tags.every((t) => t.startsWith("#")));
    });

    await t.test("distillWithLLM leverages jsonrepair to heal non-standard / trailing-comma / single-quoted JSON", async () => {
      const mockDirtyJsonFetch: typeof fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: "{ 'title': '非标JSON自愈测试', 'type': 'tool', 'cluster': 'arsenal', 'tags': ['#自愈', '#工具',], }",
                },
              },
            ],
          }),
        } as unknown as Response;
      };

      const result = await distillWithLLM("测试输入", {
        customFetcher: mockDirtyJsonFetch,
      });

      assert.equal(result.title, "非标JSON自愈测试");
      assert.equal(result.type, "tool");
      assert.equal(result.cluster, "arsenal");
      assert.deepEqual(result.tags, ["#自愈", "#工具"]);
    });

    await t.test("distillWithLLM throws descriptive error on network failure", async () => {
      const mockFailFetch: typeof fetch = async () => {
        throw new Error("Connection refused");
      };

      await assert.rejects(
        () => distillWithLLM("测试异常", { customFetcher: mockFailFetch }),
        /请求网关失败: Connection refused/
      );
    });

    await t.test("distillText prioritizes LLM distillation when available", async () => {
      const mockLLMFetch: typeof fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "知行合一哲学",
                    type: "quote",
                    cluster: "soul",
                    tags: ["#心智", "#心性修行"],
                  }),
                },
              },
            ],
          }),
        } as unknown as Response;
      };

      const result = await distillText("知行合一，致良知 —— 王阳明", {
        llmOptions: { customFetcher: mockLLMFetch },
      });

      assert.equal(result.type, "quote");
      assert.equal(result.cluster, "soul");
      assert.equal(result.title, "知行合一哲学");
      assert.deepEqual(result.tags, ["#心智", "#心性修行"]);
    });

    await t.test("distillText falls back gracefully without mechanical keyword stacking when LLM fails", async () => {
      const mockFailFetch: typeof fetch = async () => {
        throw new Error("Network timeout");
      };

      const input = "修行的作用是：略微感知自己的命数，并且在命运的车轮碾过自己时尽量平静";
      const result = await distillText(input, {
        llmOptions: { customFetcher: mockFailFetch },
      });

      // 验证极简兜底：标题精炼，类别准确，标签极简克制（仅 1 个核心类别标签），绝不堆砌机械标签！
      assert.equal(result.type, "quote");
      assert.ok(result.title.includes("修行的作用是"));
      assert.deepEqual(result.tags, ["#金句"]);
      assert.ok(!result.tags.includes("#闪念"));
    });

    await t.test("fallbackDistillText extracts author in title and handles in-text tags", () => {
      const input = "学而不思则罔，思而不学则殆 —— 孔子\n#治学 #心智";
      const result = fallbackDistillText(input);

      assert.equal(result.type, "quote");
      assert.ok(result.title.includes("学而不思则罔"));
      assert.ok(result.title.includes("出处: 孔子"));
      assert.ok(result.tags.includes("#治学"));
      assert.ok(result.tags.includes("#心智"));
      assert.equal(result.tags.length, 2);
    });

    await t.test("fallbackDistillText classifies joke and tools correctly", () => {
      const jokeText = "问：为什么程序员总是分不清万圣节和圣诞节？\n答：因为 Oct 31 == Dec 25。笑死！";
      const jokeRes = fallbackDistillText(jokeText);
      assert.equal(jokeRes.type, "joke");
      assert.deepEqual(jokeRes.tags, ["#段子"]);

      const toolText = "cargo install ripgrep --features pcre2\n用于支持高级环视正则的高性能检索。";
      const toolRes = fallbackDistillText(toolText);
      assert.equal(toolRes.type, "tool");
      assert.deepEqual(toolRes.tags, ["#工具"]);
      assert.equal(toolRes.cluster, "arsenal");
    });

    await t.test("normalizeSparkCluster maps raw clusters and fallbacks accurately", () => {
      assert.equal(normalizeSparkCluster("soul"), "soul");
      assert.equal(normalizeSparkCluster("psychology"), "soul");
      assert.equal(normalizeSparkCluster("禅意修行"), "soul");
      assert.equal(normalizeSparkCluster("literature"), "literature");
      assert.equal(normalizeSparkCluster("唯美诗意"), "literature");
      assert.equal(normalizeSparkCluster("浪漫文案"), "literature");
      assert.equal(normalizeSparkCluster("life"), "life");
      assert.equal(normalizeSparkCluster("手冲咖啡日常"), "life");
      assert.equal(normalizeSparkCluster("烟火生活"), "life");
      assert.equal(normalizeSparkCluster("arsenal"), "arsenal");
      assert.equal(normalizeSparkCluster("tools"), "arsenal");
      assert.equal(normalizeSparkCluster("cli黑科技"), "arsenal");
      assert.equal(normalizeSparkCluster("meme"), "meme");
      assert.equal(normalizeSparkCluster("搞笑段子"), "meme");
      assert.equal(normalizeSparkCluster("sparks"), "sparks");
      assert.equal(normalizeSparkCluster("cognition"), "sparks");
      assert.equal(normalizeSparkCluster("custom/workflow"), "custom/workflow");
      assert.equal(normalizeSparkCluster(undefined), "sparks");
    });

    await t.test("refineAndCreateSpark executes end-to-end pipeline across modalities", async () => {
      const db = openSparksDb(":memory:");

      // 1. URL 录入
      const sparkUrl = await refineAndCreateSpark(db, "https://github.com/BurntSushi/ripgrep", {
        cluster: "终端利器",
        tags: ["#Rust"],
        timeoutMs: 50,
      });
      assert.equal(sparkUrl.type, "tool");
      assert.equal(sparkUrl.title, "BurntSushi/ripgrep");
      assert.equal(sparkUrl.cluster, "终端利器");
      assert.equal(sparkUrl.status, "seed");
      assert.ok(sparkUrl.tags.includes("#Rust"));
      assert.ok(sparkUrl.tags.includes("#GitHub"));

      // 2. 本地图片录入
      const sparkImg = await refineAndCreateSpark(db, testImagePath, {
        title: "塔奇克马欢呼梗图",
        assetsDir: ASSETS_DIR,
      });
      assert.equal(sparkImg.type, "meme");
      assert.equal(sparkImg.title, "塔奇克马欢呼梗图");
      assert.ok(sparkImg.assetPath?.includes("tachikoma_meme.png"));
      assert.ok(sparkImg.tags.includes("#梗图"));

      // 3. 纯文本录入
      const sparkQuote = await refineAndCreateSpark(db, "博观而约取，厚积而薄发 —— 苏轼");
      assert.equal(sparkQuote.type, "quote");
      assert.ok(sparkQuote.title.includes("博观而约取"));

      closeSparksDb(db);
    });
  });

  // =========================================================================
  // 阶段三：CLI 门面命令交互测试 (Apps / CLI)
  // =========================================================================
  await suite.test("Phase 3: CLI Subcommand Interface Tests", async (t) => {
    const testCliDbPath = join(SANDBOX_DIR, "cli-test.db");

    // 辅助工厂：创建独立解析的 Commander 实例
    const createTestProgram = () => {
      const p = new Command();
      p.name("tachikoma");
      registerSparkCommands(p);
      return p;
    };

    await t.test("parseTagsInput normalizes various tag formats", () => {
      assert.deepEqual(parseTagsInput(["CLI", "Rust", "#Terminal"]), [
        "#CLI",
        "#Rust",
        "#Terminal",
      ]);
      assert.deepEqual(parseTagsInput("CLI, Rust，性能 #Go"), [
        "#CLI",
        "#Rust",
        "#性能",
        "#Go",
      ]);
      assert.deepEqual(parseTagsInput(undefined), []);
    });

    await t.test("formatClusterLabel formats friendly Chinese aliases for 6+1 MOCs", () => {
      assert.equal(formatClusterLabel("soul"), "明心见性");
      assert.equal(formatClusterLabel("literature"), "咬文嚼字");
      assert.equal(formatClusterLabel("life"), "人间烟火");
      assert.equal(formatClusterLabel("arsenal"), "实用工具库");
      assert.equal(formatClusterLabel("meme"), "熬夜背梗");
      assert.equal(formatClusterLabel("sparks"), "有趣却无用");
      assert.equal(formatClusterLabel("custom/infra"), "custom/infra·自适应主题簇");
      assert.equal(formatClusterLabel("CLI神器"), "CLI神器");
      assert.equal(formatClusterLabel(undefined), "");
      assert.equal(formatClusterLabel(null), "");
    });

    let createdCliSparkId = "";

    await t.test("tachikoma spark <target> records entry into SQLite", async () => {
      const p = createTestProgram();
      await p.parseAsync([
        "node",
        "tachikoma",
        "spark",
        "https://github.com/astral-sh/uv",
        "--type",
        "tool",
        "--title",
        "uv — 极速 Python 包管理器",
        "--tags",
        "Python",
        "Rust",
        "--cluster",
        "CLI神器",
        "--db",
        testCliDbPath,
      ]);

      const db = openSparksDb(testCliDbPath);
      const sparks = querySparks(db);
      closeSparksDb(db);

      assert.equal(sparks.length, 1);
      assert.equal(sparks[0].title, "uv — 极速 Python 包管理器");
      assert.equal(sparks[0].type, "tool");
      assert.equal(sparks[0].status, "seed");
      assert.equal(sparks[0].cluster, "CLI神器");
      assert.ok(sparks[0].tags.includes("#Python"));
      assert.ok(sparks[0].tags.includes("#Rust"));

      createdCliSparkId = sparks[0].id;
    });

    await t.test("tachikoma spark list outputs queried records", async () => {
      const p = createTestProgram();

      // 先通过 DB 追加多条记录便于过滤测试
      const db = openSparksDb(testCliDbPath);
      await refineAndCreateSpark(db, "世上本没有路，走的人多了也便成了路 —— 鲁迅", {
        tags: ["#金句", "#文学"],
      });
      await refineAndCreateSpark(db, "笑死，世界上只有两种语言：被人骂的语言和没人用的语言", {
        tags: ["#段子"],
      });
      closeSparksDb(db);

      // 捕获 console.log 输出
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));

      try {
        await p.parseAsync([
          "node",
          "tachikoma",
          "spark",
          "list",
          "--type",
          "quote",
          "--db",
          testCliDbPath,
        ]);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join("\n");
      assert.ok(output.includes("鲁迅"));
      assert.ok(!output.includes("Python 包管理器")); // 过滤排除 tool
    });

    await t.test("tachikoma spark find performs fulltext search", async () => {
      const p = createTestProgram();

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));

      try {
        await p.parseAsync([
          "node",
          "tachikoma",
          "spark",
          "find",
          "Python",
          "--db",
          testCliDbPath,
        ]);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join("\n");
      assert.ok(output.includes("uv — 极速 Python 包管理器"));
    });

    await t.test("tachikoma spark clusters & summary displays dashboard", async () => {
      const p = createTestProgram();

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));

      try {
        await p.parseAsync([
          "node",
          "tachikoma",
          "spark",
          "clusters",
          "--db",
          testCliDbPath,
        ]);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join("\n");
      assert.ok(output.includes("微主题簇与自然生长看板"));
      assert.ok(output.includes("CLI神器"));
      assert.ok(output.includes("高频标签"));
    });

    await t.test("tachikoma spark status transitions record lifecycle", async () => {
      const p = createTestProgram();

      await p.parseAsync([
        "node",
        "tachikoma",
        "spark",
        "status",
        createdCliSparkId,
        "growing",
        "--db",
        testCliDbPath,
      ]);

      const db = openSparksDb(testCliDbPath);
      const record = getSparkById(db, createdCliSparkId);
      closeSparksDb(db);

      assert.equal(record?.status, "growing");
    });

    await t.test("tachikoma spark distill <id> updates spark semantic fields", async () => {
      const p = createTestProgram();

      // 先录入一条纯文本
      const db = openSparksDb(testCliDbPath);
      const testDistillSpark = await refineAndCreateSpark(
        db,
        "修行的作用是：略微感知自己的命数，并且在命运的车轮碾过自己时尽量平静",
        { skipLlm: true }
      );
      closeSparksDb(db);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "感知命数，平静接纳",
                    type: "quote",
                    cluster: "soul",
                    tags: ["#心性修行", "#接纳命运"],
                  }),
                },
              },
            ],
          }),
        } as unknown as Response;
      }) as typeof fetch;

      try {
        await p.parseAsync([
          "node",
          "tachikoma",
          "spark",
          "distill",
          testDistillSpark.id,
          "--db",
          testCliDbPath,
        ]);
      } finally {
        globalThis.fetch = originalFetch;
      }

      const verifyDb = openSparksDb(testCliDbPath);
      const distilledRecord = getSparkById(verifyDb, testDistillSpark.id);
      closeSparksDb(verifyDb);

      assert.ok(distilledRecord);
      assert.equal(distilledRecord.title, "感知命数，平静接纳");
      assert.equal(distilledRecord.type, "quote");
      assert.equal(distilledRecord.cluster, "soul");
      assert.deepEqual(distilledRecord.tags, ["#心性修行", "#接纳命运"]);
    });
  });

  // =========================================================================
  // 阶段四：升格通道与 Ghost RFC-2026 衔接测试 (Promote to Ghost)
  // =========================================================================
  await suite.test("Phase 4: Promotion & Ghost RFC-2026 Compliance Tests", async (t) => {
    const db = openSparksDb(":memory:");

    t.after(() => {
      closeSparksDb(db);
    });

    const spark = await refineAndCreateSpark(db, "https://github.com/BurntSushi/ripgrep", {
      title: "ripgrep — 极速跨平台正则代码检索利器",
      tags: ["#CLI", "#Rust", "#开发效率"],
      cluster: "终端神兵",
      timeoutMs: 50,
    });

    await t.test("sparkToIngestionResult maps SparkRecord to compliant IngestionResult", () => {
      const ingestion = sparkToIngestionResult(spark);
      assert.equal(ingestion.title, "ripgrep — 极速跨平台正则代码检索利器");
      assert.equal(ingestion.entry, "manual-research");
      assert.equal(ingestion.mediaType, "article");
      assert.equal(ingestion.sourceUrl, "https://github.com/BurntSushi/ripgrep");
      assert.equal(ingestion.author.name, "Tachikoma Sparks");
      assert.equal(ingestion.metadata.spark_id, spark.id);
      assert.equal(ingestion.metadata.spark_status, "evergreen");
    });

    await t.test("promoteSparkToGhost formats RFC-2026, persists card and updates status to evergreen", async () => {
      const promoteRes = await promoteSparkToGhost(db, spark.id, {
        outputDir: GHOST_OUTPUT_DIR,
        category: "articles",
      });

      // 1. 验证返回结果与 DB 状态流转
      assert.equal(promoteRes.spark.status, "evergreen");
      assert.ok(promoteRes.filePath.includes("articles"));
      assert.ok(promoteRes.sha256.length > 0);

      const dbRecord = getSparkById(db, spark.id);
      assert.equal(dbRecord?.status, "evergreen");

      // 2. 验证落盘文件物理存在
      const fileContent = await readFile(promoteRes.filePath, "utf-8");
      const parsed = matter(fileContent);

      // 3. 严格校验 RFC-2026-0922 Frontmatter 契约字段
      assert.equal(parsed.data.title, "ripgrep — 极速跨平台正则代码检索利器");
      assert.equal(parsed.data.entry, "manual-research");
      assert.equal(parsed.data.media_type, "article");
      assert.equal(parsed.data.source_url, "https://github.com/BurntSushi/ripgrep");
      assert.ok(Array.isArray(parsed.data.tags));
      assert.equal(parsed.data.sha256, promoteRes.sha256);
      assert.equal(parsed.data.author.name, "Tachikoma Sparks");
      assert.equal(parsed.data.extra.spark_id, spark.id);

      // 4. 正文包含有效信息与来源标注
      assert.ok(parsed.content.includes("https://github.com/BurntSushi/ripgrep"));
      assert.ok(parsed.content.includes("#CLI"));
    });

    await t.test("promoteSparkToGhost routes douyin sparks to douyin/sparks directory automatically", async () => {
      const douyinSpark = await refineAndCreateSpark(db, "https://www.douyin.com/video/7234567890123456789", {
        title: "大模型提示词工程第一性原理",
        tags: ["#抖音", "#短视频", "#AI"],
        timeoutMs: 50,
      });

      const promoteRes = await promoteSparkToGhost(db, douyinSpark.id, {
        outputDir: GHOST_OUTPUT_DIR,
      });

      assert.equal(promoteRes.spark.status, "evergreen");
      assert.ok(
        promoteRes.filePath.includes("douyin/sparks") || promoteRes.filePath.includes("douyin\\sparks"),
        `Expected douyin/sparks in path, got: ${promoteRes.filePath}`
      );

      const fileContent = await readFile(promoteRes.filePath, "utf-8");
      const parsed = matter(fileContent);
      assert.equal(parsed.data.title, "大模型提示词工程第一性原理");
      assert.equal(parsed.data.entry, "douyin-sync");
      assert.equal(parsed.data.media_type, "video");
      assert.equal(parsed.data.extra.spark_id, douyinSpark.id);
    });

    await t.test("CLI promote subcommand executes end-to-end promotion", async () => {
      const testCliDbPath = join(SANDBOX_DIR, "cli-promote-test.db");
      const localDb = openSparksDb(testCliDbPath);
      const localSpark = await refineAndCreateSpark(localDb, "知行合一，致良知 —— 王阳明", {
        tags: ["#心智", "#心学"],
      });
      closeSparksDb(localDb);

      const p = new Command();
      p.name("tachikoma");
      registerSparkCommands(p);

      await p.parseAsync([
        "node",
        "tachikoma",
        "spark",
        "promote",
        localSpark.id,
        "--output",
        GHOST_OUTPUT_DIR,
        "--db",
        testCliDbPath,
      ]);

      const verifyDb = openSparksDb(testCliDbPath);
      const updated = getSparkById(verifyDb, localSpark.id);
      closeSparksDb(verifyDb);

      assert.equal(updated?.status, "evergreen");
    });
  });
});
