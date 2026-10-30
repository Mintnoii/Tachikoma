# Tachikoma (塔奇克马)

> 攻壳机动队敏捷情报战车 —— 个人第二大脑（Ghost）统一多模态情报摄入引擎。

## 架构

- **`apps/cli`**：统一交互门面（`tachikoma ingest <URL>` / `tachikoma sync`）；
- **`apps/douyin-sync`**：抖音收藏夹轮询、作品签名绕过、图文多模态 OCR、音视频转录对账；
- **`apps/web-clipper`**：轻量 CDP / Readability 微信推文与技术文章 DOM 纯化；
- **`packages/core`**：核心抽象契约、TypeBox Schema、RFC-2026-0922 格式化器与 Ghost `_raw/` 落盘对账引擎；
- **`packages/guard`**：Rust 静态无控制台后台常驻守护程序（`tachikoma-guard.exe`）。
