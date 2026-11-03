import { DatabaseSync } from "node:sqlite";
import { sift } from "radash";
import { SparkRecord, IngestionResult, MediaType, EntryType } from "../types.js";
import { getSparkById, updateSpark } from "../db/sparks.js";
import { formatToRFC2026Markdown, persistIngestionResult } from "../formatter.js";
import { PromoteSparkOptions, PromoteSparkResult } from "./types.js";

/**
 * 根据灵感记录的来源和标签推断 Ghost 目标子目录
 * - 抖音作品/短视频/图集 -> douyin/sparks
 * - 其他灵感/文章/工具 -> articles
 */
export function inferSparkCategory(spark: SparkRecord, explicitCategory?: string): string {
  if (explicitCategory) {
    return explicitCategory;
  }

  const isDouyin =
    Boolean(spark.sourceUrl && /(douyin\.com|iesdouyin\.com)/i.test(spark.sourceUrl)) ||
    (spark.tags && spark.tags.some((tag) => tag.includes("抖音")));

  if (isDouyin) {
    return "douyin/sparks";
  }

  return "articles";
}

/**
 * 将 SparkRecord 转换为标准 IngestionResult
 */
export function sparkToIngestionResult(spark: SparkRecord): IngestionResult {
  const isDouyin =
    Boolean(spark.sourceUrl && /(douyin\.com|iesdouyin\.com)/i.test(spark.sourceUrl)) ||
    Boolean(spark.tags && spark.tags.some((tag) => tag.includes("抖音")));
  const isTool = spark.type === "tool";
  const isMeme = spark.type === "meme" || Boolean(spark.assetPath);
  const isTweet = Boolean(spark.sourceUrl && /(twitter\.com|x\.com)/i.test(spark.sourceUrl));

  const isGallery =
    isMeme ||
    Boolean(spark.tags && spark.tags.some((tag) => tag.includes("图集") || tag.includes("多图")));
  const isVideo =
    isDouyin &&
    !isGallery &&
    Boolean(
      spark.tags?.some((tag) => tag.includes("视频") || tag.includes("转录")) ||
      (spark.sourceUrl && /video/i.test(spark.sourceUrl))
    );

  const entry: EntryType = isDouyin ? "douyin-sync" : isTool ? "manual-research" : "manual-notes";
  const mediaType: MediaType = isGallery
    ? "gallery"
    : isVideo
      ? "video"
      : isTweet
        ? "tweet"
        : "article";

  // 构建优雅声明式 Markdown 正文
  const content = sift([
    spark.content,
    spark.assetPath && `![${spark.title}](${spark.assetPath})`,
    spark.sourceUrl && `> 来源: [${spark.sourceUrl}](${spark.sourceUrl})`,
    spark.tags?.length && `**标签**: ${spark.tags.join(" ")}`,
  ]).join("\n\n");

  return {
    sourceUrl: spark.sourceUrl || `spark://${spark.id}`,
    entry,
    mediaType,
    title: spark.title,
    author: {
      name: "Tachikoma Sparks",
      url: "https://github.com/dotagents/tachikoma",
    },
    content,
    rawAssets: spark.assetPath ? [spark.assetPath] : undefined,
    metadata: {
      spark_id: spark.id,
      spark_type: spark.type,
      spark_status: "evergreen",
      spark_tags: spark.tags,
      spark_cluster: spark.cluster,
      access_count: spark.accessCount,
      promoted_at: new Date().toISOString(),
    },
    createdAt: spark.createdAt,
  };
}

/**
 * 将 Spark 记录升格并持久化为 Ghost RFC-2026 标准卡片
 */
export async function promoteSparkToGhost(
  db: DatabaseSync,
  id: string,
  options?: PromoteSparkOptions
): Promise<PromoteSparkResult> {
  const spark = getSparkById(db, id);
  if (!spark) {
    throw new Error(`[Tachikoma Sparks] 灵感记录不存在: ${id}`);
  }

  const ingestion = sparkToIngestionResult(spark);
  const outputDir = options?.outputDir ?? "Ghost/_raw";
  const category = inferSparkCategory(spark, options?.category);

  // 1. 格式化并持久化至 Ghost _raw 底座
  const persistRes = await persistIngestionResult(ingestion, outputDir, category);
  const { frontmatter } = formatToRFC2026Markdown(ingestion);

  // 2. 将灵感生命周期升级为 evergreen
  const updatedSpark = updateSpark(db, id, { status: "evergreen" });
  if (!updatedSpark) {
    throw new Error(`[Tachikoma Sparks] 更新灵感状态失败: ${id}`);
  }

  return {
    spark: updatedSpark,
    filePath: persistRes.filePath,
    sha256: persistRes.sha256,
    frontmatter,
  };
}
