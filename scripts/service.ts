import { spawn, spawnSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "pathe";

const TACHIKOMA_ROOT = resolve(import.meta.dirname, "..");
const GUARD_BIN = resolve(TACHIKOMA_ROOT, "packages/guard/target/release/tachikoma-guard.exe");
const WHISPER_BIN = resolve(TACHIKOMA_ROOT, "services/asr/bin/whisper-server.exe");
const WHISPER_MODEL = resolve(TACHIKOMA_ROOT, "services/asr/models/ggml-medium.bin");

interface ProcessInfo {
  pid: number;
  name: string;
  commandLine: string;
}

function getRunningProcesses(): ProcessInfo[] {
  try {
    const psCmd = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'tachikoma-guard|whisper-server' -or $_.Name -match 'tachikoma-guard|whisper-server' } | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json -Compress`;
    const output = execSync(`powershell -NoProfile -Command "${psCmd}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    if (!output) return [];
    const parsed = JSON.parse(output);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((item: any) => ({
      pid: item.ProcessId,
      name: item.Name || "",
      commandLine: item.CommandLine || "",
    }));
  } catch {
    return [];
  }
}

function stopProcesses(pids: number[]) {
  if (pids.length === 0) return;
  try {
    execSync(`powershell -NoProfile -Command "Stop-Process -Id ${pids.join(",")} -Force -ErrorAction SilentlyContinue"`, {
      stdio: "ignore",
    });
  } catch {}
}

const command = process.argv[2] || "status";
const target = process.argv[3] || "all"; // all | guard | asr

switch (command) {
  case "status": {
    const list = getRunningProcesses();
    const guard = list.find((p) => p.name.includes("tachikoma-guard"));
    const asr = list.find((p) => p.name.includes("whisper-server"));
    const startupLnk = resolve(
      process.env.APPDATA || "",
      "Microsoft/Windows/Start Menu/Programs/Startup/Tachikoma_Guard.lnk"
    );
    const autostart = existsSync(startupLnk);

    console.log("\n🛰️ Tachikoma 服务运行状态：");
    console.log("-----------------------------------------");
    console.log(`- 守护进程 (Guard) : ${guard ? `🟢 运行中 (PID: ${guard.pid})` : "⚪ 已停止"}`);
    console.log(`- 语音转录 (Whisper): ${asr ? `🟢 运行中 (PID: ${asr.pid}) [端口 8000]` : "⚪ 已停止"}`);
    console.log(`- 开机自启 (Startup): ${autostart ? "🟢 已启用" : "⚪ 已禁用"}`);
    console.log(`- 调度策略 (Window) : 🌙 凌晨 02:00 ~ 08:00 (每小时轮询一次)`);
    console.log("-----------------------------------------\n");
    break;
  }

  case "stop": {
    const list = getRunningProcesses();
    if (list.length === 0) {
      console.log("⚪ 当前没有正在运行的 Tachikoma 后台服务。");
      break;
    }

    let toStop: number[] = [];
    if (target === "guard") {
      toStop = list.filter((p) => p.name.includes("tachikoma-guard")).map((p) => p.pid);
      console.log("🛑 正在停止 Tachikoma 守护进程 (Guard)...");
    } else if (target === "asr") {
      toStop = list.filter((p) => p.name.includes("whisper-server")).map((p) => p.pid);
      console.log("🛑 正在停止 Whisper 语音转录服务 (ASR)...");
    } else {
      toStop = list.map((p) => p.pid);
      console.log("🛑 正在停止 Tachikoma 全部服务 (Guard + Whisper)...");
    }

    stopProcesses(toStop);
    console.log("✅ 服务已安全关闭。");
    break;
  }

  case "start": {
    const list = getRunningProcesses();
    const guardRunning = list.some((p) => p.name.includes("tachikoma-guard"));
    const asrRunning = list.some((p) => p.name.includes("whisper-server"));

    if (target === "asr") {
      if (asrRunning) {
        console.log("🟢 Whisper 语音转录服务已在运行中 (端口 8000)。");
        break;
      }
      if (!existsSync(WHISPER_BIN) || !existsSync(WHISPER_MODEL)) {
        console.error("❌ 缺少 whisper-server 二进制或 ggml-medium 模型权重，无法启动。");
        process.exit(1);
      }
      console.log("🚀 正在单独启动 Whisper 语音转录服务 (端口 8000)...");
      const child = spawn(
        WHISPER_BIN,
        [
          "--model",
          WHISPER_MODEL,
          "--host",
          "127.0.0.1",
          "--port",
          "8000",
          "--inference-path",
          "/v1/audio/transcriptions",
          "--language",
          "auto",
          "--no-timestamps",
          "--processors",
          "1",
        ],
        {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        }
      );
      child.unref();
      console.log("✅ Whisper 语音转录服务已在后台启动。");
    } else {
      if (guardRunning) {
        console.log("🟢 Tachikoma Guard 守护进程已在运行中。");
        break;
      }
      if (!existsSync(GUARD_BIN)) {
        console.error("❌ 未找到 guard 二进制，请先执行 cargo build --release 构建 packages/guard。");
        process.exit(1);
      }
      console.log("🚀 正在启动 Tachikoma 完整守护进程 (Guard + 自动托管 ASR)...");
      const child = spawn(GUARD_BIN, [], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        cwd: TACHIKOMA_ROOT,
      });
      child.unref();
      console.log("✅ Tachikoma 守护进程已在后台无黑框启动。");
    }
    break;
  }

  case "restart": {
    const list = getRunningProcesses();
    if (list.length > 0) {
      console.log("🔄 正在先停止旧服务...");
      stopProcesses(list.map((p) => p.pid));
    }
    console.log("🚀 正在拉起新服务...");
    if (!existsSync(GUARD_BIN)) {
      console.error("❌ 未找到 guard 二进制。");
      process.exit(1);
    }
    const child = spawn(GUARD_BIN, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      cwd: TACHIKOMA_ROOT,
    });
    child.unref();
    console.log("✅ Tachikoma 守护进程已重启就绪。");
    break;
  }

  case "autostart:disable": {
    const startupLnk = resolve(
      process.env.APPDATA || "",
      "Microsoft/Windows/Start Menu/Programs/Startup/Tachikoma_Guard.lnk"
    );
    if (existsSync(startupLnk)) {
      try {
        execSync(`powershell -NoProfile -Command "Remove-Item -Path '${startupLnk}' -Force"`);
        console.log("✅ 已禁用 Windows 开机自启 (已移出启动文件夹)。");
      } catch (err: any) {
        console.error("❌ 移除自启快捷方式失败:", err.message);
      }
    } else {
      console.log("⚪ Windows 开机自启当前未启用。");
    }
    break;
  }

  case "autostart:enable": {
    const startupLnk = resolve(
      process.env.APPDATA || "",
      "Microsoft/Windows/Start Menu/Programs/Startup/Tachikoma_Guard.lnk"
    );
    if (!existsSync(GUARD_BIN)) {
      console.error("❌ 未找到 guard 二进制，请先执行 cargo build --release。");
      process.exit(1);
    }
    try {
      const psScript = `$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut('${startupLnk.replace(/'/g, "''")}'); $s.TargetPath = '${GUARD_BIN.replace(/'/g, "''")}'; $s.WorkingDirectory = '${TACHIKOMA_ROOT.replace(/'/g, "''")}'; $s.Save()`;
      execSync(`powershell -NoProfile -Command "${psScript}"`);
      console.log("✅ 已配置 Windows 开机自启 (快捷方式已写入启动文件夹)。");
    } catch (err: any) {
      console.error("❌ 创建自启快捷方式失败:", err.message);
    }
    break;
  }

  default:
    console.log(`
使用说明:
  pnpm svc status           - 查看当前服务运行状态与夜间窗口
  pnpm svc stop             - 关闭全部服务 (Guard + Whisper)
  pnpm svc start            - 启动 Guard 守护进程 (托管夜间调度)
  pnpm svc restart          - 重启守护进程
  pnpm svc autostart:off    - 关闭开机自启
  pnpm svc autostart:on     - 开启开机自启
`);
}
