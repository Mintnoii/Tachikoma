#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread::sleep;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// Windows 下隐藏子进程控制台黑框标识
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.status() {
        Ok(status) => {
            log(&format!("增量同步完成，退出状态: {}", status));
        }
        Err(err) => {
            log(&format!("执行同步子进程失败: {}", err));
        }
    }
}

fn main() {
    log("Tachikoma Guard 无黑框原生守护进程已启动。");

    let home = env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\wangqing".to_string());
    let tachikoma_dir = Path::new(&home).join("Desktop").join("Tachikoma");
    let ghost_raw_dir = Path::new(&home).join("Desktop").join("Ghost").join("_raw");

    // 默认每隔 30 分钟轮询同步一次（1800 秒）
    let interval_secs = env::var("TACHIKOMA_SYNC_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(1800);

    // 启动后先等待 15 秒（等开机网络与代理稳定），然后执行首次同步
    sleep(Duration::from_secs(15));
    run_sync(&tachikoma_dir, &ghost_raw_dir);

    loop {
        sleep(Duration::from_secs(interval_secs));
        run_sync(&tachikoma_dir, &ghost_raw_dir);
    }
}
