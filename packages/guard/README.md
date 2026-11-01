# Tachikoma Guard (静态无黑框原生守护进程)

## 模块定位与职责
- **定位**：Tachikoma 静态跨平台无黑框后台守护二进制（Rust 编写，编译产物仅 227KB）；
- **使命**：彻底淘汰易碎的 VBS / PowerShell 胶水脚本，作为系统开机常驻守护进程；
- **核心行为**：
  1. 开机后自动启动，带有 `#![windows_subsystem = "windows"]` 与 `CREATE_NO_WINDOW` 标志，**100% 杜绝任何弹窗黑框**；
  2. 启动后等待 15 秒（待系统网络与代理稳定），自动执行首次收藏夹增量同步；
  3. 后续每隔 30 分钟（默认 1800 秒，支持通过环境变量 `TACHIKOMA_SYNC_INTERVAL_SECS` 自定义）静默调用 CLI 增量对账同步；
  4. 运行日志输出至 `~/.tachikoma/guard.log`。

## 构建与运行
```bash
# 1. 编译极简 Release 产物
cargo build --release --manifest-path packages/guard/Cargo.toml

# 2. 产物路径
packages/guard/target/release/tachikoma-guard.exe

# 3. 开机自启
快捷方式位于用户的 Windows Startup 目录：
~/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/Tachikoma_Guard.lnk
```
