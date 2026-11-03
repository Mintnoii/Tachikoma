# Tachikoma (塔奇克马)

> 攻壳机动队敏捷情报战车 —— 个人第二大脑（Ghost）统一多模态情报摄入引擎。

## 架构

- **`apps/cli`**：统一交互门面（`tachikoma capture <URL>` / `tachikoma sync` / `tachikoma spark`）；
- **`apps/douyin-sync`**：抖音三轨增量同步（收藏夹、创作者主页与合集专栏）、不可变路径绑定（Immutable Folder Binding）、专栏权威优先制（Mixes > Authors > Collections）、图文多模态 OCR、ASR 语音转录与游标断点对账；
- **`apps/web-clipper`**：轻量 CDP / Readability 微信推文与技术文章 DOM 纯化与标题墓碑拦截；
- **`packages/core`**：核心抽象契约、TypeBox Schema、RFC-2026-0922 格式化器、Sparks 战术灵感库（SQLite WAL + FTS5）与 Ghost `_raw/` 落盘对账引擎；
- **`packages/guard`**：Rust 静态无控制台后台常驻守护程序（`tachikoma-guard.exe`）。

## 核心特性

1. **三大轨道全覆盖**：
   - **轨道 A**：长文/公众号/推文剪藏（`tachikoma capture` $\rightarrow$ `Ghost/_raw/articles/`）；
   - **轨道 B**：战术灵感碎片流（`tachikoma spark` $\rightarrow$ 本地 `sparks.db` 毫秒级落盘，支持后续自主升格）；
   - **轨道 C**：抖音三轨增量对账同步（`tachikoma sync` $\rightarrow$ 收藏夹、`authors/` 作者专栏与 `mixes/` 不可变合集专栏）。
2. **专栏权威优先制 (Mixes > Authors > Collections)**：
   - 彻底消灭外部合集视频被手动加收藏后在本地存两份的冗余，体系化专栏优先入库，个人收藏夹自动享受全局去重；
3. **不可变路径绑定 (Immutable Folder Binding)**：
   - 落盘物理目录 100% 绑定自本地配置规则，对远程博主在平台频繁改名绝对免疫。

