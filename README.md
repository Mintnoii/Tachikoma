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
   - 落盘物理目录 100% 绑定自本地配置规则，对远程博主在平台频繁改名绝对免疫；
4. **创作者定位关键词过滤与差异化计划时刻门控**：
   - 支持作者主页按 `positioning_keywords` 过滤作品标题/文案，非定位领域内容自动跳过，保持专栏高纯度；
   - 支持 `author_times` 与 `mix_times` 差异化计划时刻（支持跨午夜判定），按需低频门控调度作者与合集专栏，未到期自动跳过，支持 `--force-all` 强制执行。

## Python 版重构差异与架构取舍 (Architectural Trade-offs)

在将原 Python 版本 `douyin-sync` 重构为现代 TypeScript 架构时，遵循第一性原理进行以下关键取舍：
1. **保留裸转录原声底座（不引入 `note_enhance`）**：
   - 旧版在摄入阶段调用 LLM 进行结构化增强与抽帧。但在全机 Bebop/Ghost 体系中，Ghost 拥有下游专职的认知演化流水线（`Ghost/.pi/lib/pipeline.ts`）。`_raw/` 底座必须遵循 100% 只读原声不可变原则，保留最纯粹的 ASR 语音原稿与 OCR 图文原貌，由下游按需炼化；
2. **轻量化流式转录（不落盘巨型视频 `downloadMedia`）**：
   - 旧版默认将数百 MB 的 `.mp4` 视频全量保存至本地，导致存储迅速膨胀。当前版本坚持“内存流式抽音频转录、直接提取图文正文、不落地巨型视频文件”的轻量化纯净设计，严守 Zero-Dirty-Card 纯净契约。

