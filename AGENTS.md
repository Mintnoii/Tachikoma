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
