import { Command } from "commander";
import { resolve } from "pathe";
import { pathToFileURL } from "node:url";
import { clipUrl } from "@tachikoma/web-clipper";
import { syncSingleAweme, syncCollections } from "@tachikoma/douyin-sync";
import { tryit } from "radash";

export const program = new Command();

program
  .name("tachikoma")
  .description("Tachikoma 统一多模态情报摄入引擎")
  .version("0.1.0");

program
  .command("ingest")
  .description("摄入单个网页、微信文章、X(Twitter)推文或单条抖音视频")
  .argument("<url>", "目标资源 URL")
  .option("-o, --output <dir>", "输出存储目录", "Ghost/_raw")
  .action(async (url: string, options: { output: string }) => {
    const outputDir = resolve(process.cwd(), options.output);
    console.log(`[Tachikoma] 开始摄入: ${url} -> ${outputDir}`);

    const isDouyin = /(douyin\.com|iesdouyin\.com)/i.test(url);

    if (isDouyin) {
      const [err, res] = await tryit(syncSingleAweme)(url, {
        outputDir,
        sqlitePath: resolve(outputDir, ".cache/sync.db"),
      });
      if (err) {
        console.error(`[Tachikoma] 抖音摄入失败: ${err.message}`);
        process.exitCode = 1;
        return;
      }
      console.log(`[Tachikoma] 摄入成功: ${res?.filePath} (SHA256: ${res?.sha256?.slice(0, 8)})`);
    } else {
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
  .action(async (options: { output: string; collectId?: string }) => {
    const outputDir = resolve(process.cwd(), options.output);
    console.log(`[Tachikoma] 开始增量同步抖音收藏夹 -> ${outputDir}`);

    const [err, results] = await tryit(syncCollections)({
      outputDir,
      sqlitePath: resolve(outputDir, ".cache/sync.db"),
      collectId: options.collectId,
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
