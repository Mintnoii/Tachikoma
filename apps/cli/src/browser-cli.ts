/**
 * Tachikoma 通用浏览器服务 CLI 子命令
 * 提供 eval (执行脚本/抽取)、screenshot (网页截图)、cdp-status (CDP 探测) 能力
 */
import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "pathe";
import pc from "picocolors";
import { withBrowserPage, toPageScript } from "@tachikoma/core";
import { tryit } from "radash";

export function registerBrowserCommands(program: Command): void {
  const browserCmd = program
    .command("browser")
    .description("Tachikoma 全机统一浏览器服务（基于 @tachikoma/core）");

  // 1. eval: 导航并提取数据
  browserCmd
    .command("eval")
    .description("导航到指定 URL 并执行抽取脚本或返回选区文本")
    .requiredOption("-u, --url <url>", "目标网页 URL")
    .option("-s, --script <script>", "JavaScript 表达式或本地 .js 脚本文件路径")
    .option("--selector <selector>", "可选的 CSS 选择器")
    .option("--json", "以纯 JSON 格式输出结果", false)
    .option("--headed", "显示有头浏览器窗口", false)
    .option("--timeout <ms>", "页面加载超时时间 (毫秒)", "30000")
    .action(async (opts) => {
      const headless = !opts.headed;
      const timeoutMs = parseInt(opts.timeout, 10) || 30000;

      let scriptCode = opts.script;
      if (scriptCode && existsSync(resolve(scriptCode))) {
        scriptCode = readFileSync(resolve(scriptCode), "utf8");
      }

      const [err, result] = await tryit(withBrowserPage)(
        { headless, timeoutMs },
        async (page) => {
          await page.goto(opts.url, {
            waitUntil: "domcontentloaded",
            timeout: timeoutMs,
          });

          if (opts.selector) {
            await page.waitForSelector(opts.selector, { timeout: 10000 });
          }

          if (scriptCode) {
            const pageScript = toPageScript(scriptCode);
            return await page.evaluate(pageScript, null);
          }

          if (opts.selector) {
            return await page.$$eval(opts.selector, (els) =>
              els.map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean)
            );
          }

          return {
            title: await page.title(),
            url: page.url(),
          };
        }
      );

      if (err) {
        if (opts.json) {
          console.log(JSON.stringify({ ok: false, error: err.message }));
        } else {
          console.error(pc.red(`[Tachikoma Browser] 执行失败: ${err.message}`));
        }
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify({ ok: true, data: result }, null, 2));
      } else {
        console.log(result);
      }
    });

  // 2. screenshot: 网页截图
  browserCmd
    .command("screenshot")
    .description("截取指定 URL 的屏幕快照")
    .requiredOption("-u, --url <url>", "目标网页 URL")
    .requiredOption("-o, --out <path>", "截图保存路径 (.png / .jpeg)")
    .option("--full-page", "是否截取完整滚动页面", false)
    .option("--headed", "显示有头浏览器窗口", false)
    .action(async (opts) => {
      const outPath = resolve(opts.out);
      const headless = !opts.headed;

      const [err] = await tryit(withBrowserPage)({ headless }, async (page) => {
        await page.goto(opts.url, { waitUntil: "networkidle" });
        await page.screenshot({ path: outPath, fullPage: opts.fullPage });
      });

      if (err) {
        console.error(pc.red(`[Tachikoma Browser] 截图失败: ${err.message}`));
        process.exitCode = 1;
        return;
      }

      console.log(pc.green(`✔ 截图已保存至: ${outPath}`));
    });

  // 3. cdp-status: 探测 CDP 连通性
  browserCmd
    .command("cdp-status")
    .description("探测本地 Chrome CDP (默认 http://127.0.0.1:9222) 状态")
    .option("-e, --endpoint <url>", "CDP 端点", "http://127.0.0.1:9222")
    .action(async (opts) => {
      const versionUrl = `${opts.endpoint.replace(/\/$/, "")}/json/version`;
      const [err, res] = await tryit(fetch)(versionUrl, { signal: AbortSignal.timeout(3000) });

      if (err || !res.ok) {
        console.log(pc.yellow(`⚠ 未检测到活跃的 Chrome CDP 会话 (${opts.endpoint})`));
        console.log(pc.dim(`  可通过快捷方式附加参数启动: chrome.exe --remote-debugging-port=9222`));
        return;
      }

      const info = await res.json();
      console.log(pc.green(`✔ 成功连接至 Chrome CDP 会话:`));
      console.log(`  Browser:   ${info.Browser}`);
      console.log(`  Protocol:  ${info["Protocol-Version"]}`);
      console.log(`  UserAgent: ${info["User-Agent"]}`);
    });
}
