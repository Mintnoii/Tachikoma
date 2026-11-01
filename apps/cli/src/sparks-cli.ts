import { Command } from "commander";
import { resolve } from "pathe";
import pc from "picocolors";
import { tryit, unique, sift, shake } from "radash";
import {
  openSparksDb,
  closeSparksDb,
  refineAndCreateSpark,
  querySparks,
  searchSparks,
  getTagsSummary,
  getClustersSummary,
  getEmergingClusters,
  updateSpark,
  deleteSpark,
  getSparkById,
  promoteSparkToGhost,
  distillText,
  getTachikomaWorkspacePaths,
  type SparkRecord,
  SparkType,
  SparkStatus,
} from "@tachikoma/core";

function reportSparksError(msg: string): void {
  console.error(pc.red(`[Tachikoma Sparks] ${msg}`));
  process.exitCode = 1;
}

function formatSparkDetails(record: Partial<SparkRecord>, statusSuffix = ""): string {
  return sift([
    record.type && `  类型:   [${record.type}]`,
    record.status && `  状态:   ${record.status}${statusSuffix}`,
    record.title && `  标题:   ${record.title}`,
    record.cluster && `  领域:   [${formatClusterLabel(record.cluster)}]`,
    record.tags?.length && `  标签:   ${record.tags.join(" ")}`,
    record.sourceUrl && `  来源:   ${record.sourceUrl}`,
    record.assetPath && `  资产:   ${record.assetPath}`,
  ]).join("\n");
}

/**
 * 格式化解析标签参数（支持空格分隔数组或逗号分隔字符串，自动补齐 # 前缀）
 */
export function parseTagsInput(rawTags?: string[] | string): string[] {
  if (!rawTags) return [];
  const tokens = [rawTags].flat().flatMap((t) => t.split(/[,，\s]+/));
  const normalized = sift(tokens.map((t) => t.trim())).map((t) =>
    t.startsWith("#") ? t : `#${t}`
  );
  return unique(normalized);
}

/**
 * 核心 MOC 领域友好中文别名映射
 */
export const SPARK_CLUSTER_ALIASES: Record<string, string> = {
  soul: "soul·灵魂避难所",
  literature: "literature·文墨与回响",
  life: "life·日常与烟火",
  arsenal: "arsenal·赛博军械库",
  meme: "meme·赛博解构槽",
  sparks: "sparks·思维火花",
};

/**
 * 格式化领域展示名称（增强友好中文别名）
 */
export function formatClusterLabel(cluster?: string | null): string {
  if (!cluster) return "";
  const trimmed = cluster.trim();
  if (SPARK_CLUSTER_ALIASES[trimmed]) {
    return SPARK_CLUSTER_ALIASES[trimmed];
  }
  if (trimmed.startsWith("custom/")) {
    return `${trimmed}·自适应主题簇`;
  }
  return trimmed;
}

/**
 * 解析并规范化数据库路径（优先使用 workspace 锚定路径，杜绝临时目录产生空库）
 */
export function resolveDbPath(customPath?: string): string {
  if (customPath === ":memory:") return ":memory:";
  const paths = getTachikomaWorkspacePaths();
  if (customPath && customPath !== ".sparks/sparks.db") {
    return resolve(paths.rootDir, customPath);
  }
  return paths.sparksDbPath;
}

/**
 * 注册 tachikoma spark 核心子命令体系
 */
export function registerSparkCommands(program: Command): Command {
  const spark = program
    .command("spark")
    .description("战术灵感军械库录入、检索与自然演化管理");

  // 1. tachikoma spark <target> (默认录入子命令)
  spark
    .command("add [target]", { isDefault: true })
    .description("随手录入灵感 (内容/URL/本地图片路径)")
    .option("-t, --tags <tags...>", "标签 (如 --tags CLI Rust 或 --tags #CLI,#Rust)")
    .option("--type <type>", "指定灵感类型 (quote|tool|joke|meme|fleeting)")
    .option("--title <title>", "指定一句话标题或亮点")
    .option("--cluster <cluster>", "归属的微主题簇")
    .option("--db <path>", "指定 SQLite 数据库路径", ".sparks/sparks.db")
    .option("--assets-dir <dir>", "指定资产存储目录", ".sparks/assets")
    .option("--json", "以 JSON 格式输出")
    .action(
      async (
        target: string | undefined,
        options: {
          tags?: string[] | string;
          type?: string;
          title?: string;
          cluster?: string;
          db?: string;
          assetsDir?: string;
          json?: boolean;
        }
      ) => {
        if (!target) {
          spark.help();
          return;
        }

        const dbPath = resolveDbPath(options.db);
        const paths = getTachikomaWorkspacePaths();
        const assetsDir = options.assetsDir
          ? resolve(paths.rootDir, options.assetsDir)
          : paths.sparksAssetsDir;
        const tags = parseTagsInput(options.tags);

        const db = openSparksDb(dbPath);
        const [err, record] = await tryit(refineAndCreateSpark)(db, target, {
          type: options.type as SparkType | undefined,
          title: options.title,
          tags,
          cluster: options.cluster,
          assetsDir,
          timeoutMs: 8000,
        });
        closeSparksDb(db);

        if (err || !record) {
          return reportSparksError(`录入失败: ${err?.message ?? "未知错误"}`);
        }

        if (options.json) {
          console.log(JSON.stringify(record, null, 2));
          return;
        }

        console.log(pc.green(`⚡ [Tachikoma Sparks] 灵感已入库 [${record.id}]`));
        console.log(formatSparkDetails(record, " (种子态)"));
      }
    );

  // 2. tachikoma spark list
  spark
    .command("list")
    .description("查看战术灵感列表")
    .option("--type <type>", "按类型过滤 (quote|tool|joke|meme|fleeting)")
    .option("--status <status>", "按生命周期状态过滤 (seed|growing|evergreen)")
    .option("--tag <tag>", "按标签过滤 (如 #CLI)")
    .option("--cluster <cluster>", "按微主题簇过滤")
    .option("-n, --limit <limit>", "限制输出条数", "20")
    .option("--db <path>", "指定 SQLite 数据库路径", ".sparks/sparks.db")
    .option("--json", "以 JSON 格式输出")
    .action(
      async (options: {
        type?: string;
        status?: string;
        tag?: string;
        cluster?: string;
        limit: string;
        db?: string;
        json?: boolean;
      }) => {
        const dbPath = resolveDbPath(options.db);
        const db = openSparksDb(dbPath);

        const limitNum = Number.parseInt(options.limit, 10) || 20;
        const normalizedTag = options.tag
          ? options.tag.startsWith("#")
            ? options.tag
            : `#${options.tag}`
          : undefined;

        const [err, records] = tryit(querySparks)(db, {
          type: options.type as SparkType | undefined,
          status: options.status as SparkStatus | undefined,
          tag: normalizedTag,
          cluster: options.cluster,
          limit: limitNum,
        });
        closeSparksDb(db);

        if (err || !records) {
          return reportSparksError(`查询失败: ${err?.message ?? "未知错误"}`);
        }

        if (options.json) {
          console.log(JSON.stringify(records, null, 2));
          return;
        }

        if (records.length === 0) {
          console.log(pc.dim("[Tachikoma Sparks] 暂无符合条件的灵感记录。"));
          return;
        }

        console.log(`✨ Tachikoma 战术灵感军械库 (共 ${records.length} 条记录):`);
        console.log(pc.dim("─".repeat(70)));
        const rendered = records
          .map((item) => {
            const clusterStr = item.cluster ? ` [${formatClusterLabel(item.cluster)}]` : "";
            const lines = [
              `• [${item.id.slice(0, 8)}] [${item.type}] [${item.status}] ${item.title}${clusterStr}`,
            ];
            if (item.tags.length > 0) {
              lines.push(`  ${item.tags.join(" ")}`);
            }
            return lines.join("\n");
          })
          .join("\n");
        console.log(rendered);
        console.log(pc.dim("─".repeat(70)));
      }
    );

  // 3. tachikoma spark find <query>
  spark
    .command("find <query>")
    .description("全文模糊/关键词即时检索直出")
    .option("--type <type>", "按类型过滤")
    .option("--status <status>", "按生命周期状态过滤")
    .option("-n, --limit <limit>", "限制命中条数", "10")
    .option("--db <path>", "指定 SQLite 数据库路径", ".sparks/sparks.db")
    .option("--json", "以 JSON 格式输出")
    .action(
      async (
        query: string,
        options: {
          type?: string;
          status?: string;
          limit: string;
          db?: string;
          json?: boolean;
        }
      ) => {
        const dbPath = resolveDbPath(options.db);
        const db = openSparksDb(dbPath);

        const limitNum = Number.parseInt(options.limit, 10) || 10;
        const [err, hits] = tryit(searchSparks)(db, query, {
          type: options.type as SparkType | undefined,
          status: options.status as SparkStatus | undefined,
          limit: limitNum,
        });
        closeSparksDb(db);

        if (err || !hits) {
          return reportSparksError(`检索失败: ${err?.message ?? "未知错误"}`);
        }

        if (options.json) {
          console.log(JSON.stringify(hits, null, 2));
          return;
        }

        if (hits.length === 0) {
          console.log(pc.dim(`[Tachikoma Sparks] 未检索到与 "${query}" 匹配的灵感。`));
          return;
        }

        console.log(`🔍 检索命中 "${query}" (共 ${hits.length} 条):`);
        console.log(pc.dim("─".repeat(70)));
        const rendered = hits
          .map((item) => {
            const preview = item.content.slice(0, 60).replace(/\n/g, " ");
            const lines = [
              `• [${item.id.slice(0, 8)}] [${item.type}] ${item.title}`,
              `  摘要: ${preview}${item.content.length > 60 ? "..." : ""}`,
            ];
            if (item.tags.length > 0) {
              lines.push(`  标签: ${item.tags.join(" ")}`);
            }
            return lines.join("\n");
          })
          .join("\n");
        console.log(rendered);
        console.log(pc.dim("─".repeat(70)));
      }
    );

  // 4. tachikoma spark clusters / summary
  const summaryAction = async (options: {
    threshold?: string;
    db?: string;
    json?: boolean;
  }) => {
    const dbPath = resolveDbPath(options.db);
    const db = openSparksDb(dbPath);
    const thresholdNum = Number.parseInt(options.threshold ?? "5", 10) || 5;

    const [clustersErr, clusters] = tryit(getClustersSummary)(db);
    const [tagsErr, tags] = tryit(getTagsSummary)(db);
    const [emergingErr, emerging] = tryit(getEmergingClusters)(db, thresholdNum);
    closeSparksDb(db);

    const data = {
      clusters: clusters ?? [],
      tags: tags ?? [],
      emerging: emerging ?? [],
    };

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log("🌌 [Tachikoma Sparks] 微主题簇与自然生长看板");
    console.log(pc.dim("─".repeat(70)));

    // 已成型微主题簇
    console.log("📦 已归纳微主题簇 (Clusters):");
    if (data.clusters.length === 0) {
      console.log(pc.dim("  (暂无已命名主题簇，可在录入时指定 --cluster 或等待标签涌现)"));
    } else {
      console.log(
        data.clusters
          .map((c) => `  • [${formatClusterLabel(c.cluster)}] (${c.count} 条)`)
          .join("\n")
      );
    }

    // 高频标签 TOP
    console.log("\n🏷️ 高频标签 TOP 10:");
    if (data.tags.length === 0) {
      console.log(pc.dim("  (暂无标签数据)"));
    } else {
      console.log(
        data.tags
          .slice(0, 10)
          .map((t) => `  • ${t.tag} (${t.count} 次)`)
          .join("\n")
      );
    }

    // 正在涌现的微主题簇
    console.log(`\n🌱 正在自然涌现的微主题簇 (同标签条目 >= ${thresholdNum}):`);
    if (data.emerging.length === 0) {
      console.log(pc.dim("  (当前尚无高频标签达到涌现阈值)"));
    } else {
      console.log(
        data.emerging
          .map((e) => `  • ${e.tag} (包含 ${e.count} 条记录，建议凝聚为微主题簇)`)
          .join("\n")
      );
    }
    console.log(pc.dim("─".repeat(70)));
  };

  spark
    .command("clusters")
    .description("查看微主题簇与自然生长看板")
    .option("--threshold <number>", "微主题簇涌现阈值", "5")
    .option("--db <path>", "指定 SQLite 数据库路径", ".sparks/sparks.db")
    .option("--json", "以 JSON 格式输出")
    .action(summaryAction);

  spark
    .command("summary")
    .description("查看微主题簇与自然生长看板 (clusters 别名)")
    .option("--threshold <number>", "微主题簇涌现阈值", "5")
    .option("--db <path>", "指定 SQLite 数据库路径", ".sparks/sparks.db")
    .option("--json", "以 JSON 格式输出")
    .action(summaryAction);

  // 5. tachikoma spark status <id> <seed|growing|evergreen>
  spark
    .command("status <id> <status>")
    .description("流转灵感生命周期状态 (seed|growing|evergreen)")
    .option("--db <path>", "指定 SQLite 数据库路径", ".sparks/sparks.db")
    .option("--json", "以 JSON 格式输出")
    .action(
      async (
        id: string,
        newStatus: string,
        options: { db?: string; json?: boolean }
      ) => {
        const allowedStatuses: SparkStatus[] = ["seed", "growing", "evergreen"];
        if (!allowedStatuses.includes(newStatus as SparkStatus)) {
          return reportSparksError(
            `非法状态: "${newStatus}". 合法状态为: ${allowedStatuses.join(", ")}`
          );
        }

        const dbPath = resolveDbPath(options.db);
        const db = openSparksDb(dbPath);

        const [err, updated] = tryit(updateSpark)(db, id, {
          status: newStatus as SparkStatus,
        });
        closeSparksDb(db);

        if (err || !updated) {
          return reportSparksError(`状态流转失败: 未找到 ID 为 "${id}" 的灵感。`);
        }

        if (options.json) {
          console.log(JSON.stringify(updated, null, 2));
          return;
        }

        console.log(`🔄 [Tachikoma Sparks] 灵感 [${id}] 状态已流转至: ${newStatus}`);
      }
    );

  // 6. tachikoma spark edit <id>
  const editCmd = spark
    .command("edit <id>")
    .description("更新指定战术灵感记录 (标题/内容/标签/类型/领域/状态)")
    .option("-t, --title <title>", "修改标题或一句话亮点")
    .option("-c, --content <content>", "修改正文内容")
    .option("--tags <tags...>", "修改标签 (如 --tags CLI Rust)")
    .option("--type <type>", "修改灵感类型 (quote|tool|joke|meme|fleeting)")
    .option("--cluster <cluster>", "修改归属主题簇")
    .option("--status <status>", "修改生命周期状态 (seed|growing|evergreen)")
    .option("--db <path>", "指定 SQLite 数据库路径", ".sparks/sparks.db")
    .option("--json", "以 JSON 格式输出")
    .action(
      async (
        id: string,
        options: {
          title?: string;
          content?: string;
          tags?: string[] | string;
          type?: string;
          cluster?: string;
          status?: string;
          db?: string;
          json?: boolean;
        }
      ) => {
        if (
          options.title === undefined &&
          options.content === undefined &&
          options.tags === undefined &&
          options.type === undefined &&
          options.cluster === undefined &&
          options.status === undefined
        ) {
          editCmd.outputHelp();
          return;
        }

        const dbPath = resolveDbPath(options.db);
        const db = openSparksDb(dbPath);

        const updates = shake({
          title: options.title,
          content: options.content,
          tags: options.tags !== undefined ? parseTagsInput(options.tags) : undefined,
          type: options.type as SparkType | undefined,
          cluster: options.cluster,
          status: options.status as SparkStatus | undefined,
        });

        const [err, updated] = tryit(updateSpark)(db, id, updates);
        closeSparksDb(db);

        if (err || !updated) {
          return reportSparksError(`更新灵感失败: 未找到 ID 为 "${id}" 的灵感。`);
        }

        if (options.json) {
          console.log(JSON.stringify(updated, null, 2));
          return;
        }

        console.log(`⚡ [Tachikoma Sparks] 灵感已更新 [${updated.id}]`);
        console.log(formatSparkDetails(updated));
      }
    );

  // 7. tachikoma spark rm <id>
  spark
    .command("rm <id>")
    .description("移除指定战术灵感记录")
    .option("--db <path>", "指定 SQLite 数据库路径", ".sparks/sparks.db")
    .option("--json", "以 JSON 格式输出")
    .action(
      async (
        id: string,
        options: {
          db?: string;
          json?: boolean;
        }
      ) => {
        const dbPath = resolveDbPath(options.db);
        const db = openSparksDb(dbPath);

        const [err, success] = tryit(deleteSpark)(db, id);
        closeSparksDb(db);

        if (err || !success) {
          return reportSparksError(`移除灵感失败: 未找到 ID 为 "${id}" 的灵感。`);
        }

        if (options.json) {
          console.log(JSON.stringify({ id, deleted: true }, null, 2));
          return;
        }

        console.log(`⚡ [Tachikoma Sparks] 灵感已移除 [${id}]`);
      }
    );

  // 8. tachikoma spark promote <id> (升格至 Ghost RFC-2026)
  spark
    .command("promote <id>")
    .description("将灵感升格为 Ghost RFC-2026 规范卡片并落盘至 Ghost/_raw/")
    .option("-o, --output <dir>", "输出存储目录", "Ghost/_raw")
    .option("-c, --category <category>", "分类目录 (默认为 articles 或 tools)")
    .option("--db <path>", "指定 SQLite 数据库路径", ".sparks/sparks.db")
    .option("--json", "以 JSON 格式输出")
    .action(
      async (
        id: string,
        options: {
          output: string;
          category?: string;
          db?: string;
          json?: boolean;
        }
      ) => {
        const dbPath = resolveDbPath(options.db);
        const paths = getTachikomaWorkspacePaths();
        const outputDir =
          options.output && options.output !== "Ghost/_raw"
            ? resolve(paths.rootDir, options.output)
            : paths.ghostRawDir;

        const db = openSparksDb(dbPath);
        const [err, result] = await tryit(promoteSparkToGhost)(db, id, {
          outputDir,
          category: options.category,
        });
        closeSparksDb(db);

        if (err || !result) {
          return reportSparksError(`升格失败: ${err?.message ?? "未知错误"}`);
        }

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(pc.bold(pc.green("🚀 [Tachikoma Sparks] 灵感升格成功！")));
        console.log(`  ID:       ${result.spark.id}`);
        console.log(`  标题:     ${result.spark.title}`);
        console.log(`  状态:     ${result.spark.status} (常青态)`);
        console.log(`  RFC-2026: ${result.filePath}`);
        console.log(`  SHA256:   ${result.sha256.slice(0, 8)}...`);
      }
    );

  // 9. tachikoma spark distill <id> (调用 LLM 对已有灵感进行二次语义提纯)
  spark
    .command("distill <id>")
    .description("调用 LLM 对已有灵感进行二次语义提纯并对齐 Ghost 领域")
    .option("--db <path>", "指定 SQLite 数据库路径", ".sparks/sparks.db")
    .option("--json", "以 JSON 格式输出")
    .action(
      async (
        id: string,
        options: {
          db?: string;
          json?: boolean;
        }
      ) => {
        const dbPath = resolveDbPath(options.db);
        const db = openSparksDb(dbPath);
        const sparkRecord = getSparkById(db, id);

        if (!sparkRecord) {
          closeSparksDb(db);
          return reportSparksError(`提纯失败: 未找到 ID 为 "${id}" 的灵感。`);
        }

        const [distillErr, distilled] = await tryit(distillText)(
          sparkRecord.content
        );

        if (distillErr || !distilled) {
          closeSparksDb(db);
          return reportSparksError(`LLM 提纯失败: ${distillErr?.message ?? "未知错误"}`);
        }

        const [updateErr, updated] = tryit(updateSpark)(db, id, {
          title: distilled.title,
          type: distilled.type,
          cluster: distilled.cluster,
          tags: distilled.tags,
        });
        closeSparksDb(db);

        if (updateErr || !updated) {
          return reportSparksError(`更新灵感失败: ${updateErr?.message ?? "未知错误"}`);
        }

        if (options.json) {
          console.log(JSON.stringify(updated, null, 2));
          return;
        }

        console.log(`🧠 [Tachikoma Sparks] 灵感 [${id}] LLM 提纯已完成：`);
        console.log(
          formatSparkDetails({
            type: updated.type,
            title: updated.title,
            cluster: updated.cluster,
            tags: updated.tags,
          })
        );
      }
    );

  return spark;
}
