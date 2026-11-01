# Tasks: Tachikoma 战术灵感军械库实施拆解

- **Proposal**: `tachikoma-tactical-sparks`
- **Status**: Proposed

---

## 阶段一：契约与存储底座 (Core & Database)
- [x] 在 `packages/core/src/schema.ts` 定义 `SparkRecord` TypeBox Schema
- [x] 在 `packages/core/src/db/` 增加 `sparks` 表结构迁移与 SQLite/FTS5 检索封装
- [x] 编写核心单测：验证 `createSpark`、`querySparks`、`ftsSearch` 纯函数


## 阶段二：轻量大模型提纯与多模态管道 (LLM Sparks Pipeline)
- [x] 编写轻量 One-shot 提纯提示词：工具类（一句话用途+亮点）、文案类（出处+情绪共鸣标签）、梗图类（OCR+风格）
- [x] 封装多模态与 URL 快速解析器，支持从 GitHub URL 快速抓取一句话简介


## 阶段三：CLI 命令交互与生命周期呈现 (Apps / CLI)
- [x] 在 `apps/cli` 注册 `tachikoma spark` 核心子命令（支持直写、文件参数、URL）
- [x] 实现 `tachikoma spark list` 与 `tachikoma spark find <query>`
- [x] 实现按标签聚类（Cluster）视图展示，呈现自然生长的微领域


## 阶段四：升格通道与全机协同 (Promotion & Cross-Agent Integration)
- [x] 实现 `tachikoma spark promote <id>`，一键将碎片封装为 RFC-2026 规范推送至 Ghost `_raw/`
- [x] 补充文档与单测校验
