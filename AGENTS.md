---
type: meta
title: "AGENTS.md — Tachikoma 跨 Agent 唯一真理源与工程规约"
created: 2026-10-31T03:00:00+08:00
updated: 2026-10-31T03:00:00+08:00
tags: [meta, cross-agent, truth-source, architecture, tachikoma, ingest]
status: evergreen
---

# AGENTS.md — Tachikoma 跨 Agent 唯一真理源与工程规约

> ⚠️ **所有 Agent（Claude Code、Codex、Pi、Gemini 等）在此仓库工作时必须严格遵循本文档。**  
> 本文件为 `Tachikoma` 局部自包含宪法。核心原则：**AI 是执行者，qing 是判断者；代码与架构是持久资产，对话仅是运行时交互。**

---

## 1. 系统定位与核心职责

**Tachikoma（塔奇克马）** 是全机唯一个人第二大脑（Ghost）统一多模态情报摄入引擎（Universal Ingestion Engine）。

### 1.1 核心使命
- **统一入口**：取代割裂的 `ob-clipper` 与 `douyin-sync`，上层统一对外提供极简输入能力；
- **重构治理**：
  - 将原 Python 版本的 `douyin-sync` 重构成现代 TypeScript 子应用（`apps/douyin-sync`），负责监听收藏夹、绕过风控、音视频下载与图集 OCR 转录；
  - 将原 `ob-clipper` 重构为网页/推文提纯子应用（`apps/web-clipper`）；
- **输出规范**：摄入结果严格对齐 Ghost RFC-2026-0922 契约，直通 `Ghost/_raw/` 不可变底座。

---

## 2. 仓库架构与拓扑 (Workspace Topology)

```text
Tachikoma/ (pnpm Monorepo)
├── apps/
│   ├── cli/             # 统一摄入门面命令行（tachikoma ingest / sync）
│   ├── douyin-sync/     # 【专职重构子 App】抖音收藏夹轮询、图文多模态 OCR、转录对账
│   └── web-clipper/     # 【专职重构子 App】基于 CDP/Readability 的网页推文 DOM 提纯
├── packages/
│   ├── core/            # 核心抽象契约、TypeBox Schema、RFC-2026-0922 格式化
│   └── guard/           # Rust 编写的静态无黑框守护二进制（tachikoma-guard.exe）
├── openspec/            # OpenSpec 架构规约驱动目录（specs 与 changes）
├── AGENTS.md            # 本文件：项目跨 Agent 行为宪法
└── README.md            # 项目全景说明
```

---

## 3. 起手编码审美门禁（强制第一性原则）

- **工具库三剑客强制使用**：
  - 路径处理 100% 依托 `pathe`，严禁原生路径拼接与 Windows 斜杠硬编码；
  - 流式与集合变换 100% 依托 `radash`（`tryit`, `unique`, `sift` 等），严禁业务层裸写 `try/catch` 样板或手写过程式 `for` 游标；
  - 强类型契约 100% 依托 `@sinclair/typebox`，杜绝散落的 `Array.isArray` 防御八股；
- **严禁 VBS / PowerShell 脚本胶水**：后台常驻与守护统一走 `packages/guard` Rust 编译产物；
- **包管理器**：全工程严格使用 `pnpm`。

---

## 4. 抖音解析链路与失败诊断规约 (Douyin Ingestion Resilience)

单条作品匿名解析遵循多路径深度发现策略：
`SSR 注入变量 (_ROUTER_DATA / __INITIAL_STATE__ / __INIT_PROPS__)` $\to$ `<script id="RENDER_DATA">` $\to$ `页内同源 XHR (/aweme/detail/)` $\to$ `DOM 启发式兜底`。

### 4.1 失败分类语义 (DouyinExtractionReason)
- **`ssr-no-item`**：页面 SSR 变量与 RENDER_DATA 均未包含有效作品数据对象；
- **`bridge-empty`**：同源桥接器（`BrowserBridge`）执行结果未通过契约收窄（返回值为空、非对象或缺失契约字段）；
- **`api-forbidden`**：页内 XHR 或同源接口返回 HTTP 403 被平台反爬拦截；
- **`dom-fallback-empty`**：所有结构化数据提取全线落空，且 DOM/og 兜底提取亦无实质有效正文。

### 4.2 诊断与置信度契约
- 提取失败时必须抛出 `DouyinExtractionError`，携带 `reason` 与已尝试的 `attempts` 路径清单，严禁裸 TypeError 穿透；
- 当仅通过 DOM 兜底命中时，标记 `confidence = "dom-fallback"`，CLI 回执提示正文可能不完整，建议后续执行 `spark distill` 补齐；
- 提取失败时严禁在 `sparks.db` 留下半成品脏记录。

### 4.3 登录态通道与自动兜底规约 (Authed Session Fallback)
- **Profile 隔离存储**：登录态严格隔离持久化于 `<workspace>/.secrets/douyin-profile`，永不提交版本库（`.gitignore` 门禁）；
- **匿名失败自动兜底**：单条抖音作品优先纯内存匿名提取；若全败且探活本机 Profile 处于已登录态（`authed`），自动以持久化会话重试一次，成功回执与卡片标记 `confidence = "authed-session"` 与 `source = "authed-session"`；
- **同步强前置守卫**：`tachikoma sync` 必须携带已登录 Profile，未登录时直接明确报错拦截，严禁以匿名上下文进入收藏夹抓取循环；
- **会话管理命令**：提供无界面静默探活 `tachikoma douyin status` 与有界面扫码登录 `tachikoma douyin login`。
