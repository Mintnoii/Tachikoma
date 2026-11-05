---
type: meta
title: "AGENTS.md — Tachikoma 工程规约与贡献指南"
updated: 2026-11-05
tags: [meta, architecture, contributing, tachikoma]
---

# AGENTS.md — Tachikoma 工程规约

> 供 AI 编码助手（Claude Code、Codex、Gemini 等）与人类贡献者在此仓库工作时遵循。

---

## 1. 系统定位

**Tachikoma** 是一个多模态内容摄入引擎（pnpm Monorepo），将网页长文、抖音视频图文与灵感碎片统一收归本地知识库。

**三条摄入轨道：**
- **轨道 A**：`tachikoma capture <URL>` —— 网页 / 推文剪藏，落盘为 RFC-2026-0922 格式 Markdown
- **轨道 B**：`tachikoma spark` —— 灵感碎片毫秒级落盘本地 SQLite（`.sparks/sparks.db`），支持后续语义提纯与升格
- **轨道 C**：`tachikoma sync` —— 抖音收藏夹、创作者主页与合集专栏三轨增量对账同步

**输出契约：**
- 摄入结果落盘目录由 `GHOST_RAW_DIR` 环境变量控制，默认自动探测同级知识库 `_raw/` 目录，兜底至 `output/`
- 底座文件 100% 只读不可变，严禁在摄入阶段做 LLM 增强或覆写
- 格式规范见 `packages/core/src/formatter.ts`（RFC-2026-0922）

---

## 2. 仓库拓扑

```text
Tachikoma/ (pnpm Monorepo)
├── apps/
│   ├── cli/             # 统一命令行门面（capture / sync / spark）
│   ├── douyin-sync/     # 抖音三轨增量对账、OCR、ASR 语音转录
│   └── web-clipper/     # CDP / Readability 网页推文 DOM 提纯
├── packages/
│   ├── core/            # 核心契约、TypeBox Schema、RFC 格式化器、Sparks SQLite 引擎
│   └── guard/           # Rust 无黑框后台守护进程（夜间自动调度 + ASR 探活自愈）
├── services/
│   └── asr/             # 本地 whisper.cpp ASR Sidecar（OpenAI Audio 兼容 HTTP）
├── openspec/            # 规约驱动变更提案（specs / changes）
└── tests/               # Vitest 单元与集成测试
```

---

## 3. 编码规约（起手强制执行）

**工具库强制使用，严禁手搓替代：**
- 路径操作 → `pathe`（`resolve` / `dirname` / `basename`），严禁原生 `path` 或手拼斜杠
- 集合与流式处理 → `radash`（`tryit` / `unique` / `sift`），严禁裸写 `try/catch` 或过程式 `for` 游标
- 强类型契约 → `@sinclair/typebox`，严禁散落的 `Array.isArray` 防御八股

**其他铁律：**
- 包管理器统一 `pnpm`，严禁 npm / yarn
- 严禁引入 Python 运行时（含 venv / pip）；外部二进制能力由 Rust Guard 托管
- 严禁 VBS / PowerShell 脚本胶水；服务管理统一走 `scripts/service.ts`（`pnpm svc:*`）
- 登录凭据严格隔离于 `.secrets/`，永不提交版本库

---

## 4. 后台服务生命周期

```bash
pnpm svc:status          # 查看 Guard / Whisper / 自启状态
pnpm svc:start           # 启动后台守护（夜间 02:00~08:00 自动轮询）
pnpm svc:stop            # 彻底关闭全部后台服务
pnpm svc:restart         # 重启
pnpm svc:autostart:on    # 注册 Windows 开机自启
pnpm svc:autostart:off   # 取消开机自启
```

---

## 5. 抖音解析链路规约

**单条作品提取优先级链（2026-11-03 收敛）：**

```
有登录态持久化上下文
  → 页内同源 XHR（必带 device_platform=webapp&aid=6383）
  → 命中图文过滤(images_base) → 切 /note/{id} 重试
  → DOM 启发式兜底
匿名无 Cookie
  → m.douyin.com 分享页 _ROUTER_DATA（唯一匿名数据来源）
```

**失败分类语义（`DouyinExtractionReason`）：**

| reason | 含义 |
|---|---|
| `ssr-no-item` | 页面 SSR 变量与 RENDER_DATA 均无有效作品数据 |
| `bridge-empty` | 同源桥接器返回值为空或缺失契约字段 |
| `api-forbidden` | 页内 XHR 返回 403，被平台反爬拦截 |
| `images-filtered` | 详情接口过滤图文作品（`filter_reason: images_base`），作品未下架 |
| `dom-fallback-empty` | 所有结构化路径落空，DOM/og 兜底亦无实质正文 |

**页内脚本执行铁律：**
- 严禁把函数源码字符串直接传给 `page.evaluate`（Playwright 会将字符串当表达式求值，返回 `undefined` 且不报错）
- 统一使用 `toPageScript()`（`packages/core/src/browser.ts`）：`page.evaluate(toPageScript(SCRIPT), arg)`
- 图文作品请求必须携带 `device_platform=webapp&aid=6383`，落地页必须是 `www.douyin.com/note/{id}`

**不可变路径绑定（Immutable Folder Binding）：**
- 落盘物理目录 100% 绑定本地配置中的 `mix.name`，完全忽略平台端动态名称，对博主改名绝对免疫
- 断点检查点（`sync_checkpoints`）与增量对账按不可变的 `mix_id` 唯一锁死

---

## 6. 变更提案流程（OpenSpec）

重大功能或架构调整在 `openspec/changes/<name>/` 下立项：
- `proposal.md`：背景、目标、非目标、技术方案
- `design.md`（可选）：详细设计
- `tasks.md`：可执行任务清单，逐项勾选推进
