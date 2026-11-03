#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs::OpenOptions;
use std::io::Write;
use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// Windows 下隐藏子进程控制台黑框标识
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 子进程统一不弹黑框
fn silent(cmd: &mut Command) {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
}

fn get_log_file() -> PathBuf {
    let home = env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\wangqing".to_string());
    Path::new(&home).join(".tachikoma").join("guard.log")
}

fn log(msg: &str) {
    let log_path = get_log_file();
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let now = chrono_lite();
        let _ = writeln!(file, "[{}] {}", now, msg);
    }
}

fn chrono_lite() -> String {
    // 极简时间戳，零第三方依赖
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}s", duration.as_secs(), duration.subsec_millis())
}

fn run_sync(tachikoma_dir: &Path, ghost_raw_dir: &Path) {
    log("开始执行收藏夹增量对账同步...");

    let cli_path = tachikoma_dir.join("apps").join("cli").join("dist").join("cli.js");
    let mut cmd = Command::new("node");
    cmd.arg(&cli_path)
        .arg("sync")
        .arg("-o")
        .arg(ghost_raw_dir)
        .current_dir(tachikoma_dir);
    // 抖音对境外出口做风控：同步必须直连，清掉外网代理环境变量
    for key in [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ] {
        cmd.env_remove(key);
    }
    silent(&mut cmd);

    match cmd.status() {
        Ok(status) => {
            log(&format!("增量同步完成，退出状态: {}", status));
        }
        Err(err) => {
            log(&format!("执行同步子进程失败: {}", err));
        }
    }
}

/// 本地 ASR 服务守护器：随守护进程启动，异常退出即重启
///
/// 背景：语音转录依赖本地 faster-whisper 服务（services/asr），它是 Node 侧唯一可行的
/// 推理后端。此前要手动跑 start.ps1，忘了起就静默降级、故障不可见。
struct AsrSupervisor {
    server_dir: PathBuf,
    port: u16,
    child: Option<Child>,
    last_spawn: Option<Instant>,
    missing_logged: bool,
}

impl AsrSupervisor {
    fn new(tachikoma_dir: &Path) -> Self {
        let port = env::var("TACHIKOMA_ASR_PORT")
            .ok()
            .and_then(|s| s.parse::<u16>().ok())
            .unwrap_or(8000);
        AsrSupervisor {
            server_dir: tachikoma_dir.join("services").join("asr"),
            port,
            child: None,
            last_spawn: None,
            missing_logged: false,
        }
    }

    fn binary_path(&self) -> PathBuf {
        if let Ok(custom) = env::var("TACHIKOMA_ASR_BIN") {
            return PathBuf::from(custom);
        }
        #[cfg(windows)]
        {
            self.server_dir.join("bin").join("whisper-server.exe")
        }
        #[cfg(not(windows))]
        {
            self.server_dir.join("bin").join("whisper-server")
        }
    }

    fn model_path(&self) -> PathBuf {
        if let Ok(custom) = env::var("TACHIKOMA_ASR_MODEL_PATH") {
            return PathBuf::from(custom);
        }
        self.server_dir
            .join("models")
            .join("ggml-medium.bin")
    }

    /// TCP 探活，不引入 HTTP 依赖：端口能连上即视为服务在跑
    fn healthy(&self) -> bool {
        let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, self.port);
        TcpStream::connect_timeout(&addr.into(), Duration::from_millis(600)).is_ok()
    }

    fn spawn(&mut self) {
        let binary = self.binary_path();
        if !binary.exists() {
            if !self.missing_logged {
                log(&format!(
                    "ASR 服务未就绪：缺少 whisper-server 二进制 {}；按 services/asr/README.md 下载官方 whisper.cpp 包",
                    binary.display()
                ));
                self.missing_logged = true;
            }
            return;
        }
        let model = self.model_path();
        if !model.exists() {
            if !self.missing_logged {
                log(&format!(
                    "ASR 服务未就绪：缺少模型权重 {}；按 services/asr/README.md 下载 ggml-medium.bin",
                    model.display()
                ));
                self.missing_logged = true;
            }
            return;
        }

        // 15 秒内不重复拉起，避免模型加载期被误判失败而反复重启
        if let Some(last) = self.last_spawn {
            if last.elapsed() < Duration::from_secs(15) {
                return;
            }
        }

        // whisper.cpp 原生支持 OpenAI 语音转写路径，无解释器、零胶水
        let mut cmd = Command::new(&binary);
        cmd.arg("--model")
            .arg(&model)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(self.port.to_string())
            .arg("--inference-path")
            .arg("/v1/audio/transcriptions")
            .arg("--language")
            .arg("auto")
            .arg("--no-timestamps")
            .arg("--processors")
            .arg("1")
            .current_dir(&self.server_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        silent(&mut cmd);

        match cmd.spawn() {
            Ok(child) => {
                log(&format!(
                    "ASR 服务已拉起 (pid {}，端口 {})",
                    child.id(),
                    self.port
                ));
                self.child = Some(child);
                self.last_spawn = Some(Instant::now());
                self.missing_logged = false;
            }
            Err(err) => log(&format!("拉起 ASR 服务失败: {}", err)),
        }
    }

    fn ensure(&mut self) {
        if env::var("TACHIKOMA_GUARD_ASR").map(|v| v == "0").unwrap_or(false) {
            return;
        }

        if let Some(child) = self.child.as_mut() {
            match child.try_wait() {
                Ok(Some(status)) => {
                    log(&format!("ASR 服务进程退出 ({})，准备重启", status));
                    self.child = None;
                }
                Ok(None) => return, // 仍存活
                Err(err) => {
                    log(&format!("探测 ASR 子进程失败: {}", err));
                    self.child = None;
                }
            }
        }

        // 端口已在监听 = 已有实例（本进程拉起的或外部残留的），不重复启动
        if self.healthy() {
            return;
        }
        self.spawn();
    }
}

fn main() {
    log("Tachikoma Guard 无黑框原生守护进程已启动。");

    let home = env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\wangqing".to_string());
    let tachikoma_dir = Path::new(&home).join("Desktop").join("Tachikoma");
    let ghost_raw_dir = Path::new(&home).join("Desktop").join("Ghost").join("_raw");

    // 默认每隔 30 分钟轮询同步一次（1800 秒）；设为 0 表示只守护 ASR、不跑同步
    let interval_secs = env::var("TACHIKOMA_SYNC_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(1800);
    let sync_enabled = interval_secs > 0;

    let mut asr = AsrSupervisor::new(&tachikoma_dir);

    // 略等系统就绪先拉起 ASR；模型懒加载，不占用启动时间
    sleep(Duration::from_secs(5));
    asr.ensure();

    // 再等网络与代理稳定，执行首次同步
    sleep(Duration::from_secs(10));
    if sync_enabled {
        run_sync(&tachikoma_dir, &ghost_raw_dir);
    } else {
        log("收藏夹同步已禁用 (TACHIKOMA_SYNC_INTERVAL_SECS=0)，本进程仅守护 ASR 服务");
    }

    let mut elapsed = 0u64;
    loop {
        sleep(Duration::from_secs(10));
        elapsed += 10;
        asr.ensure();

        if sync_enabled && elapsed >= interval_secs {
            run_sync(&tachikoma_dir, &ghost_raw_dir);
            elapsed = 0;
        }
    }
}
