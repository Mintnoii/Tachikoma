import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "pathe";
import {
  SparkRecord,
  SparkTypeSchema,
  SparkStatusSchema,
  SparkRecordSchema,
  validateSparkRecord,
  validateCreateSparkInput,
  openSparksDb,
  closeSparksDb,
  createSpark,
  getSparkById,
  updateSpark,
  deleteSpark,
  incrementSparkAccess,
  querySparks,
  ftsSearch,
  searchSparks,
  getTagsSummary,
  getClustersSummary,
  getSparksGroupedByCluster,
  getEmergingClusters,
} from "@tachikoma/core";

const SANDBOX_DIR = join(process.cwd(), "tests/sandbox/sparks-test");
const DB_FILE_PATH = join(SANDBOX_DIR, "sparks.db");

test("Tachikoma Tactical Sparks: Core Contracts & SQLite Storage Engine Tests", async (suite) => {
  // 清理测试沙盒
  await rm(SANDBOX_DIR, { recursive: true, force: true });

  await suite.test("1. TypeBox Schema Contract Validation", async (t) => {
    await t.test("Valid SparkRecord passes validation", () => {
      const valid: SparkRecord = {
        id: "spark-001",
        type: "tool",
        status: "seed",
        title: "ripgrep — 极速代码检索神器",
        content: "基于 Rust 的行级正则表达式检索工具，速度远超 grep。",
        sourceUrl: "https://github.com/BurntSushi/ripgrep",
        tags: ["#CLI", "#Rust", "#开发利器"],
        accessCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const validated = validateSparkRecord(valid);
      assert.equal(validated.id, "spark-001");
      assert.equal(validated.type, "tool");
      assert.equal(validated.status, "seed");
      assert.deepEqual(validated.tags, ["#CLI", "#Rust", "#开发利器"]);
    });

    await t.test("Invalid SparkRecord throws descriptive error", () => {
      const invalid = {
        id: "spark-bad",
        type: "unknown-type", // 非法类型
        status: "seed",
        title: "", // 标题为空
      };

      assert.throws(
        () => validateSparkRecord(invalid),
        /SparkRecord 契约校验失败/
      );
    });

    await t.test("CreateSparkInput validation allows minimal fields", () => {
      const input = {
        type: "quote" as const,
        title: "生于忧患，死于安乐",
        content: "孟子名言",
      };

      const validated = validateCreateSparkInput(input);
      assert.equal(validated.type, "quote");
      assert.equal(validated.title, "生于忧患，死于安乐");
    });
  });

  await suite.test("2. Database Lifecycle & Sandbox File Initialization", async (t) => {
    await t.test("Initializes in-memory and file-based SQLite database with FTS5", () => {
      const memDb = openSparksDb(":memory:");
      assert.ok(memDb, "内存数据库创建成功");
      closeSparksDb(memDb);

      const fileDb = openSparksDb(DB_FILE_PATH);
      assert.ok(fileDb, "文件沙盒数据库创建成功");
      closeSparksDb(fileDb);
    });
  });

  await suite.test("3. Sparks CRUD Operations", async (t) => {
    const db = openSparksDb(":memory:");

    t.after(() => {
      closeSparksDb(db);
    });

    let createdId = "";

    await t.test("createSpark generates defaults and persists record", () => {
      const created = createSpark(db, {
        type: "tool",
        title: "pathe — 现代化路径操作库",
        content: "严禁原生路径拼接与 Windows 斜杠硬编码，100% 依托 pathe。",
        tags: ["#Node", "#Path", "#Tool"],
      });

      assert.ok(created.id, "自动生成唯一 ID");
      assert.equal(created.type, "tool");
      assert.equal(created.status, "seed", "默认进入种子态");
      assert.equal(created.accessCount, 0, "默认访问频次为 0");
      assert.ok(created.createdAt, "具备创建时间戳");
      assert.deepEqual(created.tags, ["#Node", "#Path", "#Tool"]);
      createdId = created.id;
    });

    await t.test("getSparkById retrieves persisted record and unpacks tags JSON", () => {
      const fetched = getSparkById(db, createdId);
      assert.ok(fetched, "能够根据 ID 查得记录");
      assert.equal(fetched.id, createdId);
      assert.equal(fetched.title, "pathe — 现代化路径操作库");
      assert.deepEqual(fetched.tags, ["#Node", "#Path", "#Tool"]);
    });

    await t.test("getSparkById returns null for non-existing ID", () => {
      const nonExisting = getSparkById(db, "non-existing-uuid-999");
      assert.equal(nonExisting, null);
    });

    await t.test("updateSpark modifies fields and advances lifecycle status", () => {
      const updated = updateSpark(db, createdId, {
        status: "growing",
        cluster: "前端装备库",
        tags: ["#Node", "#Path", "#重构神兵"],
      });

      assert.ok(updated);
      assert.equal(updated.status, "growing", "生命周期从 seed 跃迁为 growing");
      assert.equal(updated.cluster, "前端装备库");
      assert.deepEqual(updated.tags, ["#Node", "#Path", "#重构神兵"]);

      const refetched = getSparkById(db, createdId);
      assert.equal(refetched?.cluster, "前端装备库");
    });

    await t.test("updateSpark returns null for non-existing ID", () => {
      const updated = updateSpark(db, "ghost-id-404", { title: "无中生有" });
      assert.equal(updated, null);
    });

    await t.test("incrementSparkAccess increments access count", () => {
      const incremented1 = incrementSparkAccess(db, createdId);
      assert.equal(incremented1?.accessCount, 1);
      const incremented2 = incrementSparkAccess(db, createdId);
      assert.equal(incremented2?.accessCount, 2);
    });

    await t.test("deleteSpark removes record and returns boolean status", () => {
      const deleted = deleteSpark(db, createdId);
      assert.equal(deleted, true);
      assert.equal(getSparkById(db, createdId), null);

      const deletedAgain = deleteSpark(db, createdId);
      assert.equal(deletedAgain, false);
    });
  });

  await suite.test("4. Multi-Dimensional Query & Filtering", async (t) => {
    const db = openSparksDb(":memory:");

    t.after(() => {
      closeSparksDb(db);
    });

    // 预置多样化测试数据
    createSpark(db, {
      id: "s-1",
      type: "tool",
      status: "seed",
      title: "picomatch 模式匹配器",
      content: "高性能 glob 正则编译匹配库",
      tags: ["#CLI", "#Regex"],
      accessCount: 5,
      createdAt: "2026-10-31T01:00:00.000Z",
    });

    createSpark(db, {
      id: "s-2",
      type: "tool",
      status: "growing",
      cluster: "CLI武器库",
      title: "radash 流式工具库",
      content: "现代 TypeScript 实用函数库，告别手搓过程式",
      tags: ["#CLI", "#TypeScript", "#工具"],
      accessCount: 15,
      createdAt: "2026-10-31T02:00:00.000Z",
    });

    createSpark(db, {
      id: "s-3",
      type: "quote",
      status: "evergreen",
      cluster: "心智沉淀",
      title: "第一性原理设计",
      content: "重构只看宏观 IPO 从第一性原理全新设计，绝不照搬旧代码的历史妥协",
      tags: ["#心智", "#架构"],
      accessCount: 42,
      createdAt: "2026-10-31T03:00:00.000Z",
    });

    createSpark(db, {
      id: "s-4",
      type: "meme",
      status: "seed",
      title: "攻壳机动队战车表情包",
      content: "好奇心爆棚的 Tachikoma 多脚战车在数字世界欢呼",
      assetPath: "assets/memes/tachikoma_cheer.png",
      tags: ["#攻壳", "#表情包"],
      accessCount: 1,
      createdAt: "2026-10-31T04:00:00.000Z",
    });

    await t.test("Filters by type", () => {
      const tools = querySparks(db, { type: "tool" });
      assert.equal(tools.length, 2);
      assert.ok(tools.every((item) => item.type === "tool"));
    });

    await t.test("Filters by status", () => {
      const seeds = querySparks(db, { status: "seed" });
      assert.equal(seeds.length, 2);
      const evergreen = querySparks(db, { status: "evergreen" });
      assert.equal(evergreen.length, 1);
      assert.equal(evergreen[0].id, "s-3");
    });

    await t.test("Filters by tag using json_each index", () => {
      const cliItems = querySparks(db, { tag: "#CLI" });
      assert.equal(cliItems.length, 2);
      const regexItems = querySparks(db, { tag: "#Regex" });
      assert.equal(regexItems.length, 1);
      assert.equal(regexItems[0].id, "s-1");
    });

    await t.test("Filters by cluster", () => {
      const weaponCluster = querySparks(db, { cluster: "CLI武器库" });
      assert.equal(weaponCluster.length, 1);
      assert.equal(weaponCluster[0].id, "s-2");

      const unclustered = querySparks(db, { cluster: null });
      assert.equal(unclustered.length, 2);
    });

    await t.test("Sorts by accessCount desc", () => {
      const sorted = querySparks(db, { sortBy: "access_count", sortOrder: "desc" });
      assert.equal(sorted[0].id, "s-3");
      assert.equal(sorted[0].accessCount, 42);
      assert.equal(sorted[sorted.length - 1].id, "s-4");
      assert.equal(sorted[sorted.length - 1].accessCount, 1);
    });

    await t.test("Paginates with limit and offset", () => {
      const paged = querySparks(db, { limit: 2, offset: 1, sortBy: "created_at", sortOrder: "asc" });
      assert.equal(paged.length, 2);
      assert.equal(paged[0].id, "s-2");
      assert.equal(paged[1].id, "s-3");
    });
  });

  await suite.test("5. FTS5 Fulltext Search & Graceful Fallback", async (t) => {
    const db = openSparksDb(":memory:");

    t.after(() => {
      closeSparksDb(db);
    });

    createSpark(db, {
      id: "fts-1",
      type: "tool",
      title: "Rust 编译优化实战",
      content: "利用 LTO 和 codegen-units 打造极致轻量高性能二进制",
      tags: ["#Rust", "#性能"],
    });

    createSpark(db, {
      id: "fts-2",
      type: "quote",
      title: "攻壳机动队经典语录",
      content: "若我们的神明是网络，那么灵魂便是流淌在数据间的光芒",
      tags: ["#攻壳", "#赛博朋克"],
    });

    createSpark(db, {
      id: "fts-3",
      type: "joke",
      title: "程序员的经典段子",
      content: "世界上有 10 种人，一种懂二进制，另一种不懂二进制",
      tags: ["#段子", "#二进制"],
    });

    await t.test("Matches keyword in title", () => {
      const hits = ftsSearch(db, "Rust");
      assert.equal(hits.length, 1);
      assert.equal(hits[0].id, "fts-1");
    });

    await t.test("Matches keyword in content body", () => {
      const hits = ftsSearch(db, "神明");
      assert.equal(hits.length, 1);
      assert.equal(hits[0].id, "fts-2");
    });

    await t.test("Matches keyword across multiple records with BM25 rank", () => {
      const hits = ftsSearch(db, "二进制");
      assert.equal(hits.length, 2);
    });

    await t.test("Search alias works equivalently", () => {
      const hits = searchSparks(db, "程序员");
      assert.equal(hits.length, 1);
      assert.equal(hits[0].id, "fts-3");
    });

    await t.test("Returns empty array for empty or whitespace query", () => {
      assert.deepEqual(ftsSearch(db, ""), []);
      assert.deepEqual(ftsSearch(db, "   "), []);
    });

    await t.test("Handles malformed punctuation and syntax gracefully via fallback", () => {
      // 未闭合引号或特殊符号在 FTS 中通常抛出语法错误，容错层自动平滑降级为 LIKE
      const hitsColon = ftsSearch(db, "codegen-units");
      assert.ok(hitsColon.length >= 1);

      const hitsSpecial = ftsSearch(db, "\"经典");
      assert.ok(Array.isArray(hitsSpecial));
    });

    await t.test("FTS index syncs when record is updated and deleted", () => {
      updateSpark(db, "fts-3", { title: "架构师的终极感悟", content: "高内聚低耦合" });
      const hitsOld = ftsSearch(db, "程序员");
      assert.equal(hitsOld.length, 0);

      const hitsNew = ftsSearch(db, "架构师");
      assert.equal(hitsNew.length, 1);
      assert.equal(hitsNew[0].id, "fts-3");

      deleteSpark(db, "fts-3");
      const hitsDeleted = ftsSearch(db, "架构师");
      assert.equal(hitsDeleted.length, 0);
    });
  });

  await suite.test("6. Tag & Cluster Grouping / Emerging Clusters", async (t) => {
    const db = openSparksDb(":memory:");

    t.after(() => {
      closeSparksDb(db);
    });

    // 录入 5 条具有 #CLI 标签的灵感，触发微主题簇涌现阈值
    for (let i = 1; i <= 5; i++) {
      createSpark(db, {
        id: `cli-${i}`,
        type: "tool",
        title: `CLI 工具 #${i}`,
        content: `这是第 ${i} 个命令行神器`,
        cluster: i > 2 ? "终端武器库" : undefined,
        tags: ["#CLI", `#SubTag${i}`],
      });
    }

    // 录入 2 条 #AI 标签
    createSpark(db, {
      id: "ai-1",
      type: "quote",
      title: "大模型心智",
      content: "Prompt 即工程",
      cluster: "AI洞察",
      tags: ["#AI"],
    });
    createSpark(db, {
      id: "ai-2",
      type: "quote",
      title: "Agent Loop",
      content: "自主规划与工具调用",
      cluster: "AI洞察",
      tags: ["#AI"],
    });

    await t.test("getTagsSummary returns ordered tag frequencies", () => {
      const summary = getTagsSummary(db);
      assert.ok(summary.length > 0);
      assert.equal(summary[0].tag, "#CLI");
      assert.equal(summary[0].count, 5);

      const aiTag = summary.find((s) => s.tag === "#AI");
      assert.equal(aiTag?.count, 2);
    });

    await t.test("getClustersSummary returns non-empty cluster counts", () => {
      const clusters = getClustersSummary(db);
      assert.equal(clusters.length, 2);
      const weaponCluster = clusters.find((c) => c.cluster === "终端武器库");
      assert.equal(weaponCluster?.count, 3);
      const aiCluster = clusters.find((c) => c.cluster === "AI洞察");
      assert.equal(aiCluster?.count, 2);
    });

    await t.test("getSparksGroupedByCluster groups all sparks into map", () => {
      const grouped = getSparksGroupedByCluster(db);
      assert.ok(grouped["终端武器库"]);
      assert.equal(grouped["终端武器库"].length, 3);
      assert.ok(grouped["AI洞察"]);
      assert.equal(grouped["AI洞察"].length, 2);
      assert.ok(grouped["unclustered"]);
      assert.equal(grouped["unclustered"].length, 2);
    });

    await t.test("getEmergingClusters detects tags meeting threshold (threshold=5)", () => {
      const emerging5 = getEmergingClusters(db, 5);
      assert.equal(emerging5.length, 1);
      assert.equal(emerging5[0].tag, "#CLI");
      assert.equal(emerging5[0].count, 5);
      assert.equal(emerging5[0].sparkIds.length, 5);

      const emerging2 = getEmergingClusters(db, 2);
      assert.equal(emerging2.length, 2);
      const tags = emerging2.map((e) => e.tag);
      assert.ok(tags.includes("#CLI"));
      assert.ok(tags.includes("#AI"));
    });
  });

  // 收尾清理沙盒
  await rm(SANDBOX_DIR, { recursive: true, force: true });
});
