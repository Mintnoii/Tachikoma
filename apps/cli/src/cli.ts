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
  DouyinExtractionError,
  resolveDouyinProfileDir,
  hasDouyinSession,
  loginInteractively,
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

function handleDouyinError(err: unknown, showLoginHint = false): void {
  if (
    err instanceof DouyinExtractionError ||
    (err && (err as any).name === "DouyinExtractionError")
  ) {
    const extractionErr = err as DouyinExtractionError;
    console.error(pc.red(`[Tachikoma] 抖音摄入失败: ${extractionErr.message}`));
    console.error(pc.yellow(`  失败原因 (reason):   ${extractionErr.reason}`));
    if (extractionErr.attempts && extractionErr.attempts.length > 0) {
      console.error(pc.yellow(`  已尝试路径 (attempts):`));
      extractionErr.attempts.forEach((att) =>
        console.error(pc.yellow(`    • ${att}`))
      );
    }
  } else {
    console.error(
      pc.red(`[Tachikoma] 抖音摄入失败: ${(err as any)?.message ?? "未知错误"}`)
    );
  }
  if (showLoginHint) {
    console.error(
      pc.yellow(`  未检测到登录态，可执行 "tachikoma douyin login" 建立登录态`)
    );
  }
  process.exitCode = 1;
}

export interface IngestDouyinOptions {
  sparksDbPath?: string;
  customTransport?: (path: string, params?: Record<string, unknown>) => Promise<any>;
  customTranscribe?: (source: string) => Promise<string | undefined>;
  customOcr?: (images: string[]) => Promise<string>;
  customExtractor?: (urlOrId: string) => Promise<DouyinAwemeItem>;
  customSummarizer?: (text: string) => Promise<{ summary?: string; keyPoints?: string[] }>;
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

  const summary = (() => {
    if (keyPoints.length > 0) {
      const raw = keyPoints.slice(0, 2).join("；");
      return raw.length > 100 ? `${raw.slice(0, 97)}...` : raw;
    }
    return cleaned.length > 0 ? cleaned.slice(0, 80) : "";
  })();

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
  .command("capture")
  .alias("cap")
  .alias("ingest") // 保持向后兼容，但推荐 capture
  .description("捕获单个网页、微信文章、X(Twitter)推文或单条抖音视频")
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

      // 提取链路由库统一负责「有登录态走登录态、无则匿名」。
      // 这里只传 profileDir，不再自己重复一遍匿名/登录态编排。
      const profileDir = resolveDouyinProfileDir();
      const [err, res] = await tryit(ingestDouyinToSparks)(url, {
        sparksDbPath,
        profileDir,
      });

      const finalRes = await (async () => {
        if (!err && res) {
          return res;
        }
        handleDouyinError(err, false);
        return null;
      })();

      if (!finalRes) {
        return;
      }

      const { record, aweme, summary, keyPoints } = finalRes;
      console.log(pc.green(`⚡ [Tachikoma] 单条抖音灵感已收录 (未污染 Ghost 收藏夹)`));
      console.log(`  ID:     ${record.id}`);
      console.log(`  标题:   ${record.title}`);
      console.log(`  作者:   ${aweme.author.nickname}`);
      console.log(`  媒介:   ${aweme.mediaType === "gallery" ? "图集" : "视频"}`);
      console.log(`  标签:   ${record.tags.join(" ")}`);
      if (aweme.source) {
        console.log(`  来源:   ${aweme.source}`);
      }
      if (
        aweme.confidence === "authed-session" ||
        aweme.source === "authed-session"
      ) {
        console.log(pc.cyan(`  数据来源: 数据来自登录态会话`));
      } else if (aweme.confidence === "dom-fallback") {
        console.log(
          pc.yellow(
            `  ⚠️  注意:   提取结果来自 DOM 兜底，正文可能不完整，建议后续 spark distill 补齐`
          )
        );
      }
      if (summary) {
        console.log(`  摘要:   ${summary}`);
      }
      if (keyPoints && keyPoints.length > 0) {
        console.log(
          `  核心要点:\n${keyPoints.map((point) => `    • ${point}`).join("\n")}`
        );
      }
      console.log(
        pc.dim(
          `  提示:   未来可通过 "tachikoma spark promote ${record.id}" 自主升格至 Ghost 知识库`
        )
      );
    } else {
      console.log(pc.cyan(`[Tachikoma] 开始捕获: ${url} -> ${outputDir}`));
      const [err, res] = await tryit(clipUrl)(url, { outputDir });

      if (err) {
        return reportCliError(`网页捕获失败: ${err.message}`);
      }
      console.log(pc.green(`[Tachikoma] 捕获成功: ${res?.filePath} (SHA256: ${res?.sha256?.slice(0, 8)})`));
    }
  });

// 抖音登录态通道子命令体系
const douyinCmd = program
  .command("douyin")
  .description("抖音登录态会话与同步工具");

douyinCmd
  .command("status")
  .description("查询抖音持久化会话登录态 (authed / anonymous)")
  .action(async () => {
    const profileDir = resolveDouyinProfileDir();
    const status = await hasDouyinSession(profileDir);
    console.log(status);
  });

douyinCmd
  .command("login")
  .description("交互式登录抖音并建立持久化会话")
  .action(async () => {
    const profileDir = resolveDouyinProfileDir();
    console.log(pc.cyan(`[Tachikoma] 启动抖音交互式登录窗口...`));
    console.log(`  Profile 路径: ${profileDir}`);
    const [err, status] = await tryit(loginInteractively)(profileDir);
    if (err || status !== "authed") {
      return reportCliError(`登录失败或已超时: ${err?.message ?? status}`);
    }
    console.log(pc.green(`[Tachikoma] 登录成功: ${status}`));
    console.log(`  Profile 路径: ${profileDir}`);
  });

program
  .command("sync")
  .description("增量轮询抖音收藏夹并自动对账转录")
  .option("-o, --output <dir>", "输出存储目录", "Ghost/_raw")
  .option("-c, --collect-id <id>", "指定单个收藏夹 ID 同步")
  .option("-k, --keywords <keywords...>", "收藏夹名称包含关键字过滤 (空格隔开，如 -k 存档 面试)")
  .option("-f, --folders <folders...>", "收藏夹精确名称过滤 (空格隔开，如 -f AI存档 心理学存档)")
  .option("--rules-config <path>", "指定收藏夹规则配置文件路径 (默认 apps/douyin-sync/config/sync_rules.yaml)")
  .action(async (options: {
    output?: string;
    collectId?: string;
    keywords?: string[];
    folders?: string[];
    rulesConfig?: string;
  }) => {
    const profileDir = resolveDouyinProfileDir();
    const sessionStatus = await hasDouyinSession(profileDir);
    if (sessionStatus !== "authed") {
      return reportCliError(
        '未检测到有效抖音登录态，请先执行 "tachikoma douyin login" 建立登录态'
      );
    }

    const paths = getTachikomaWorkspacePaths();
    const outputDir =
      options.output && options.output !== "Ghost/_raw"
        ? resolve(paths.rootDir, options.output)
        : paths.ghostRawDir;
    console.log(pc.cyan(`[Tachikoma] 开始增量同步抖音收藏夹 -> ${outputDir}`));

    const audioTranscriber = createAudioTranscriber();
    const filterRules =
      options.keywords || options.folders
        ? {
            collections: options.folders,
            nameKeywords: options.keywords,
          }
        : undefined;

    const [err, results] = await tryit(syncCollections)({
      outputDir,
      sqlitePath: resolve(outputDir, ".cache/sync.db"),
      collectId: options.collectId,
      filterRules,
      rulesConfigPath: options.rulesConfig,
      customTranscribe: audioTranscriber,
      profileDir,
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
