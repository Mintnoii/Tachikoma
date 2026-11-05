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
    let home = env::var("USERPROFILE").or_else(|_| env::var("HOME")).unwrap_or_default();
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

    /// 停止由 Supervisor 托管的 ASR 服务并清理句柄
    fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let pid = child.id();
            let _ = child.kill();
            let _ = child.wait();
            log(&format!("已主动停止 ASR 服务进程 (pid: {})", pid));
        }
    }
}

/// 获取当前本地时间的小时（0..23），零第三方外部 crate 依赖
fn current_local_hour() -> u32 {
    #[cfg(windows)]
    {
        #[repr(C)]
        struct SystemTime {
            w_year: u16,
            w_month: u16,
            w_day_of_week: u16,
            w_day: u16,
            w_hour: u16,
            w_minute: u16,
            w_second: u16,
            w_milliseconds: u16,
        }

        extern "system" {
            fn GetLocalTime(lp_system_time: *mut SystemTime);
        }

        let mut st = SystemTime {
            w_year: 0,
            w_month: 0,
            w_day_of_week: 0,
            w_day: 0,
            w_hour: 0,
            w_minute: 0,
            w_second: 0,
            w_milliseconds: 0,
        };
        unsafe {
            GetLocalTime(&mut st);
        }
        st.w_hour as u32
    }
    #[cfg(not(windows))]
    {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        // 简易东八区推算 (UTC+8)
        ((secs + 8 * 3600) % 86400 / 3600) as u32
    }
}

/// 判断当前小时是否在指定的窗口内 [start_hour, end_hour)
fn is_in_time_window(current_hour: u32, start: u32, end: u32) -> bool {
    if start <= end {
        current_hour >= start && current_hour < end
    } else {
        // 跨午夜场景，例如 22点到次日6点
        current_hour >= start || current_hour < end
    }
}

fn main() {
    log("Tachikoma Guard 无黑框原生守护进程已启动。");

    let home = env::var("USERPROFILE").or_else(|_| env::var("HOME")).unwrap_or_default();
    let tachikoma_dir = env::var("TACHIKOMA_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| Path::new(&home).join("Desktop").join("Tachikoma"));
    let ghost_raw_dir = env::var("GHOST_RAW_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| Path::new(&home).join("Desktop").join("Ghost").join("_raw"));

    // 时间窗口：默认仅在凌晨 02:00 ~ 08:00 期间运行
    let window_start: u32 = env::var("TACHIKOMA_SYNC_WINDOW_START")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(2);
    let window_end: u32 = env::var("TACHIKOMA_SYNC_WINDOW_END")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8);

    // 轮询间隔：默认 1 小时 (3600 秒)
    let interval_secs: u64 = env::var("TACHIKOMA_SYNC_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3600);

    let mut asr = AsrSupervisor::new(&tachikoma_dir);
    let mut last_sync_time: Option<Instant> = None;
    let mut logged_outside = false;

    log(&format!(
        "守护调度策略配置完成：运行窗口 [{:02}:00 ~ {:02}:00)，轮询间隔 {} 秒",
        window_start, window_end, interval_secs
    ));

    loop {
        let current_hour = current_local_hour();
        let in_window = is_in_time_window(current_hour, window_start, window_end);

        if in_window {
            logged_outside = false;
            // 1. 处于 02:00 ~ 08:00 活跃窗口：确保 ASR 服务拉起并健康
            asr.ensure();

            // 2. 检查是否达到同步间隔（进入窗口立即触发首次，之后每隔 1 小时轮询）
            let should_sync = match last_sync_time {
                None => true,
                Some(last) => last.elapsed() >= Duration::from_secs(interval_secs),
            };

            if should_sync {
                run_sync(&tachikoma_dir, &ghost_raw_dir);
                last_sync_time = Some(Instant::now());
            }
        } else {
            // 不在窗口期（08:00 ~ 次日 02:00）：休眠节电，关闭 ASR 释放显存/内存
            if !logged_outside {
                log(&format!(
                    "当前时间 {:02}:xx 已离开活跃窗口 [{:02}:00 ~ {:02}:00)，自动停止 ASR 服务并进入休眠守候...",
                    current_hour, window_start, window_end
                ));
                logged_outside = true;
            }
            asr.stop();
            last_sync_time = None; // 离开窗口后重置计时器，次日 02:00 准时再次触发
        }

        // 每隔 15 秒轻量探针一次时钟状态
        sleep(Duration::from_secs(15));
    }
}
