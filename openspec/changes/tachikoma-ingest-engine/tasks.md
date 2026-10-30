# Tasks: Tachikoma 实施与迁移任务清单

## 1. 规范化与基座初始化 (Phase 1)
- [x] 1.1 初始化 OpenSpec 规约体系与提案立项 (`proposal.md`, `design.md`, `tasks.md`)
- [x] 1.2 整理 `Desktop/Tachikoma` 工程目录，规范 `pnpm-workspace.yaml` 与依赖声明（引入 `pathe`, `radash`, `@sinclair/typebox`）
- [x] 1.3 编写项目统一契约定义（`packages/core/src/types.ts`）

## 2. 媒体与抖音收藏夹子 App (Phase 2 - 重构 douyin-sync 为 apps/douyin-sync)
- [x] 2.1 基于 TypeScript 与浏览器同源/CDP 桥接重构抖音签名与收藏夹 API 请求链路
- [x] 2.2 实现收藏夹与作者作品的定时增量轮询对账机制
- [x] 2.3 接入 Magpie 视觉模型（`auto/gemini-3.8-flash`）实现纯 TS 图集无音轨 OCR 转录
- [x] 2.4 对接音视频流下载与结构化笔记生成管线

## 3. 网页与推文摄入子 App (Phase 3 - 重构 ob-clipper 为 apps/web-clipper)
- [x] 3.1 基于 Playwright/CDP 实现轻量零焦点页面获取器
- [x] 3.2 封装 Readability + JSDOM 文章正文提纯管线
- [x] 3.3 输出标准 Markdown 卡片并支持单测覆盖

## 4. 原生 Rust 守护者与 CLI 聚合 (Phase 4)
- [x] 4.1 编写 Rust 无控制台静默守护进程（`packages/guard/tachikoma-guard.exe`），彻底淘汰所有 `.vbs`
- [x] 4.2 统一 CLI 入口（`apps/cli`）：`tachikoma ingest <URL>` 与 `tachikoma sync`
- [x] 4.3 跨 Agent CLI 门面闭环与综合单测验证
