import { Command } from "commander";
import { resolve } from "pathe";
import { pathToFileURL } from "node:url";
import pc from "picocolors";
import { clipUrl } from "@tachikoma/web-clipper";
import {
  syncCollections,
  fetchAwemeDetailWithTranscript,
  fetchPublicAwemeItem,
  createAudioTranscriber,
  DouyinAwemeItem,
} from "@tachikoma/douyin-sync";
import {
  getTachikomaWorkspacePaths,
  openSparksDb,
  closeSparksDb,
  createSpark,
  extractDouyinUrlOrId,
  SparkRecord,
} from "@tachikoma/core";
import { tryit, sift, unique } from "radash";
import { registerSparkCommands } from "./sparks-cli.js";

function reportCliError(msg: string): void {
  console.error(pc.red(`[Tachikoma] ${msg}`));
  process.exitCode = 1;
}

export interface IngestDouyinOptions {
  sparksDbPath?: string;
  customTransport?: (path: string, params?: Record<string, unknown>) => Promise<any>;
  customTranscribe?: (source: string) => Promise<string | undefined>;
  customOcr?: (images: string[]) => Promise<string>;
  customExtractor?: (urlOrId: string) => Promise<DouyinAwemeItem>;
  customSummarizer?: (text: string) => Promise<{ summary?: string; keyPoints?: string[] }>;
  cdpEndpoint?: string;
  profileDir?: string;
  magpieBaseUrl?: string;
  magpieApiKey?: string;
  magpieModel?: string;
  customFetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface IngestDouyinResult {
  record: SparkRecord;
  aweme: DouyinAwemeItem;
  transcript?: string;
  ocrContent?: string;
  summary?: string;
  keyPoints?: string[];
}

/**
 * 纯函数：从正文、语音转录或图集 OCR 中提取高密度内容摘要与核心要点
 */
export function extractContentSummary(
  text: string,
  options?: { maxPoints?: number }
): { summary: string; keyPoints: string[] } {
  const cleaned = text
    .replace(/^###\s+第\s*\d+\s*张\s*\/[^\n]*/gm, "")
    .replace(/【无文字】/g, "")
    .replace(/>\s*⚠️\s*OCR[^\n]*/g, "")
    .replace(/🎙️\s*音频转录:/g, "")
    .replace(/🖼️\s*OCR转录:/g, "")
    .replace(/^[#>*-\s]+/gm, "")
    .trim();

  const rawLines = cleaned
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (line.length < 2) return false;
      if (/^#[\p{L}\p{N}_-]+$/u.test(line)) return false;
      return true;
    });

  const candidatePoints = rawLines.flatMap((line) => {
    if (line.length <= 80 && line.length >= 4) {
      return [line];
    }
    const sentences = line
      .split(/(?<=[。！？；!?;\n])\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 4);
    return sentences.length > 0 ? sentences : [line.slice(0, 80)];
  });

  const uniquePoints = unique(candidatePoints);
  const maxPoints = options?.maxPoints ?? 5;
  const keyPoints = uniquePoints.slice(0, maxPoints);

  let summary = "";
  if (keyPoints.length > 0) {
    summary = keyPoints.slice(0, 2).join("；");
    if (summary.length > 100) {
      summary = summary.slice(0, 97) + "...";
    }
  } else if (cleaned.length > 0) {
    summary = cleaned.slice(0, 80);
  }

  return { summary, keyPoints };
}

/**
 * 单条抖音链接内部消化纯函数：转为 Sparks 灵感录入 SQLite（不污染 Ghost 收藏夹）
 */
export async function ingestDouyinToSparks(
  url: string,
  options?: IngestDouyinOptions
): Promise<IngestDouyinResult> {
  const audioTranscriber = options?.customTranscribe ?? createAudioTranscriber();
  const data = await fetchAwemeDetailWithTranscript(url, {
    customTransport: options?.customTransport,
    customTranscribe: audioTranscriber,
    customOcr: options?.customOcr,
    customExtractor: options?.customExtractor,
    cdpEndpoint: options?.cdpEndpoint,
    profileDir: options?.profileDir,
    magpieBaseUrl: options?.magpieBaseUrl,
    magpieApiKey: options?.magpieApiKey,
    magpieModel: options?.magpieModel,
    customFetcher: options?.customFetcher,
  });

  const { aweme, transcript, ocrContent } = data;
  const title = (aweme.desc || `抖音作品_${aweme.id}`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  const contentParts = sift([
    aweme.desc?.trim(),
    transcript ? `🎙️ 音频转录:\n${transcript}` : undefined,
    ocrContent ? `🖼️ OCR转录:\n${ocrContent}` : undefined,
  ]);
  const content = contentParts.length > 0 ? contentParts.join("\n\n") : title;

  const extracted = options?.customSummarizer
    ? await options.customSummarizer(content)
    : extractContentSummary(content);
  const summary = extracted.summary;
  const keyPoints = extracted.keyPoints;

  const authorTag = aweme.author.nickname
    ? `#${aweme.author.nickname.replace(/[\s#,，]/g, "")}`
    : undefined;
  const mediaTag = aweme.mediaType === "gallery" ? "#图集" : "#短视频";
  const tags = unique(sift(["#抖音", mediaTag, authorTag]));

  const paths = getTachikomaWorkspacePaths();
  const dbPath = options?.sparksDbPath ?? paths.sparksDbPath;
  const db = openSparksDb(dbPath);

  try {
    const record = createSpark(db, {
      type: "fleeting",
      title,
      content,
      sourceUrl: aweme.shareUrl,
      tags,
      status: "seed",
    });
    return { record, aweme, transcript, ocrContent, summary, keyPoints };
  } finally {
    closeSparksDb(db);
  }
}

export const program = new Command();

program
  .name("tachikoma")
  .description("Tachikoma 统一多模态情报摄入引擎")
  .version("0.1.0");

// 注册 Sparks 灵感子命令体系
registerSparkCommands(program);

program
  .command("ingest")
  .description("摄入单个网页、微信文章、X(Twitter)推文或单条抖音视频")
  .argument("<url>", "目标资源 URL")
  .option("-o, --output <dir>", "输出存储目录", "Ghost/_raw")
  .option("--sparks-db <path>", "指定灵感数据库路径")
  .action(async (url: string, options: { output?: string; sparksDb?: string }) => {
    const paths = getTachikomaWorkspacePaths();
    const outputDir =
      options.output && options.output !== "Ghost/_raw"
        ? resolve(paths.rootDir, options.output)
        : paths.ghostRawDir;

    const extractedDouyin = extractDouyinUrlOrId(url);
    const isDouyin = Boolean(
      (extractedDouyin.url && /(douyin\.com|iesdouyin\.com)/i.test(extractedDouyin.url)) ||
      (extractedDouyin.awemeId && /^\d{15,22}$/.test(url.trim()))
    );

    if (isDouyin) {
      console.log(pc.cyan(`[Tachikoma] 检测到单条抖音链接，转入 Sparks 灵感流: ${url}`));
      const sparksDbPath = options.sparksDb
        ? resolve(paths.rootDir, options.sparksDb)
        : paths.sparksDbPath;

      const [err, res] = await tryit(ingestDouyinToSparks)(url, {
        sparksDbPath,
      });

      if (err || !res) {
        return reportCliError(`抖音摄入失败: ${err?.message ?? "未知错误"}`);
      }

      const { record, aweme, summary, keyPoints } = res;
      console.log(pc.green(`⚡ [Tachikoma] 单条抖音灵感已收录 (未污染 Ghost 收藏夹)`));
      console.log(`  ID:     ${record.id}`);
      console.log(`  标题:   ${record.title}`);
      console.log(`  作者:   ${aweme.author.nickname}`);
      console.log(`  媒介:   ${aweme.mediaType === "gallery" ? "图集" : "视频"}`);
      console.log(`  标签:   ${record.tags.join(" ")}`);
      if (summary) {
        console.log(`  摘要:   ${summary}`);
      }
      if (keyPoints && keyPoints.length > 0) {
        console.log(`  核心要点:\n${keyPoints.map((point) => `    • ${point}`).join("\n")}`);
      }
      console.log(pc.dim(`  提示:   未来可通过 "tachikoma spark promote ${record.id}" 自主升格至 Ghost 知识库`));
    } else {
      console.log(pc.cyan(`[Tachikoma] 开始摄入: ${url} -> ${outputDir}`));
      const [err, res] = await tryit(clipUrl)(url, { outputDir });

      if (err) {
        return reportCliError(`网页剪藏失败: ${err.message}`);
      }
      console.log(pc.green(`[Tachikoma] 剪藏成功: ${res?.filePath} (SHA256: ${res?.sha256?.slice(0, 8)})`));
    }
  });

program
  .command("sync")
  .description("增量轮询抖音收藏夹并自动对账转录")
  .option("-o, --output <dir>", "输出存储目录", "Ghost/_raw")
  .option("-c, --collect-id <id>", "指定单个收藏夹 ID 同步")
  .action(async (options: { output?: string; collectId?: string }) => {
    const paths = getTachikomaWorkspacePaths();
    const outputDir =
      options.output && options.output !== "Ghost/_raw"
        ? resolve(paths.rootDir, options.output)
        : paths.ghostRawDir;
    console.log(pc.cyan(`[Tachikoma] 开始增量同步抖音收藏夹 -> ${outputDir}`));

    const audioTranscriber = createAudioTranscriber();
    const [err, results] = await tryit(syncCollections)({
      outputDir,
      sqlitePath: resolve(outputDir, ".cache/sync.db"),
      collectId: options.collectId,
      customTranscribe: audioTranscriber,
    });
    if (err) {
      return reportCliError(`同步失败: ${err.message}`);
    }

    console.log(pc.green(`[Tachikoma] 同步完成，本次新增摄入: ${results?.length ?? 0} 件作品。`));
  });

// 直接执行入口：仅在作为 CLI 进程启动时解析参数
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await program.parseAsync(process.argv);
}
