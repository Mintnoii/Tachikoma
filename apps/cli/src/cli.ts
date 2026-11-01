import { Command } from "commander";
import { resolve } from "pathe";
import { pathToFileURL } from "node:url";
import { clipUrl } from "@tachikoma/web-clipper";
import {
  syncCollections,
  fetchAwemeDetailWithTranscript,
  createAudioTranscriber,
  DouyinAwemeItem,
} from "@tachikoma/douyin-sync";
import {
  getTachikomaWorkspacePaths,
  openSparksDb,
  closeSparksDb,
  createSpark,
  SparkRecord,
} from "@tachikoma/core";
import { tryit, sift, unique } from "radash";
import { registerSparkCommands } from "./sparks-cli.js";

export interface IngestDouyinOptions {
  sparksDbPath?: string;
  customTransport?: (path: string, params?: Record<string, unknown>) => Promise<any>;
  customTranscribe?: (source: string) => Promise<string | undefined>;
  customOcr?: (images: string[]) => Promise<string>;
  cdpEndpoint?: string;
  profileDir?: string;
}

export interface IngestDouyinResult {
  record: SparkRecord;
  aweme: DouyinAwemeItem;
  transcript?: string;
}

/**
 * 单条抖音链接内部消化纯函数：转为 Sparks 战术灵感录入 SQLite 军械库（不污染 Ghost 收藏夹）
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
    cdpEndpoint: options?.cdpEndpoint,
    profileDir: options?.profileDir,
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

  const authorTag = aweme.author.nickname
    ? `#${aweme.author.nickname.replace(/[\s#,，]/g, "")}`
    : undefined;
  const tags = unique(sift(["#抖音", "#短视频", authorTag]));

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
    return { record, aweme, transcript };
  } finally {
    closeSparksDb(db);
  }
}

export const program = new Command();

program
  .name("tachikoma")
  .description("Tachikoma 统一多模态情报摄入引擎")
  .version("0.1.0");

// 注册战术灵感军械库子命令体系
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

    const isDouyin = /(douyin\.com|iesdouyin\.com)/i.test(url);

    if (isDouyin) {
      console.log(`[Tachikoma] 检测到单条抖音链接，转入战术灵感军械库: ${url}`);
      const sparksDbPath = options.sparksDb
        ? resolve(paths.rootDir, options.sparksDb)
        : paths.sparksDbPath;

      const [err, res] = await tryit(ingestDouyinToSparks)(url, {
        sparksDbPath,
      });

      if (err || !res) {
        console.error(`[Tachikoma] 抖音摄入失败: ${err?.message ?? "未知错误"}`);
        process.exitCode = 1;
        return;
      }

      const { record, aweme } = res;
      console.log(`⚡ [Tachikoma] 单条抖音灵感已录入随身军械库 (未污染 Ghost 收藏夹)`);
      console.log(`  ID:     ${record.id}`);
      console.log(`  标题:   ${record.title}`);
      console.log(`  作者:   ${aweme.author.nickname}`);
      console.log(`  标签:   ${record.tags.join(" ")}`);
      console.log(`  提示:   未来可通过 "tachikoma spark promote ${record.id}" 自主升格至 Ghost 知识库`);
    } else {
      console.log(`[Tachikoma] 开始摄入: ${url} -> ${outputDir}`);
      const [err, res] = await tryit(clipUrl)(url, { outputDir });

      if (err) {
        console.error(`[Tachikoma] 网页剪藏失败: ${err.message}`);
        process.exitCode = 1;
        return;
      }
      console.log(`[Tachikoma] 剪藏成功: ${res?.filePath} (SHA256: ${res?.sha256?.slice(0, 8)})`);
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
    console.log(`[Tachikoma] 开始增量同步抖音收藏夹 -> ${outputDir}`);

    const audioTranscriber = createAudioTranscriber();
    const [err, results] = await tryit(syncCollections)({
      outputDir,
      sqlitePath: resolve(outputDir, ".cache/sync.db"),
      collectId: options.collectId,
      customTranscribe: audioTranscriber,
    });
    if (err) {
      console.error(`[Tachikoma] 同步失败: ${err.message}`);
      process.exitCode = 1;
      return;
    }

    console.log(`[Tachikoma] 同步完成，本次新增摄入: ${results?.length ?? 0} 件作品。`);
  });

// 直接执行入口：仅在作为 CLI 进程启动时解析参数
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await program.parseAsync(process.argv);
}
