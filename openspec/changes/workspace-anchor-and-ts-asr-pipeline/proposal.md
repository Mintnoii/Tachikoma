# Proposal: 锚定仓库根目录消除空库风险 & 全 TypeScript 原生语音转录 (ASR) 管线闭环

- **Name**: `workspace-anchor-and-ts-asr-pipeline`
- **Date**: 2026-11-01
- **Status**: Proposed
- **Author**: qing & Pi (Coordinator)
- **Target Issues**: 
  - Issue 4: `process.cwd()` 相对路径导致在任意非根目录执行命令时静默新建空库与空目录
  - Issue 2: 抖音视频转录未接线，仅落作者文案，缺少现代全 TS/HTTP 原生 ASR 方案（彻底抛弃旧 Python 技术栈）

---

## 1. 为什么做（Why）

### 1.1 问题 4：`process.cwd()` 运行时路径游离与数据割裂
- **现状与痛点**：
  - `apps/cli/src/sparks-cli.ts` (L66, L107, L547) 与 `apps/cli/src/cli.ts` (L25, L59) 广泛使用了 `resolve(process.cwd(), ...)` 作为 SQLite 数据库与素材资产的落盘路径；
  - 当用户在终端切换到任意其他目录（例如 `~`、`Desktop` 或其他子项目）执行 `tachikoma spark add` 或 `tachikoma ingest` 时，程序会在当前终端所在目录下静默新建 `.sparks/sparks.db` 和 `.sparks/assets`，导致数据分散割裂在各个临时目录，无法形成统一军械库。
- **第一性解决方案**：
  - 构建轻量路径锚定工具函数 `resolveWorkspaceRoot()`（优先读取环境变量 `TACHIKOMA_HOME`，未配置时自当前目录向上寻访 `pnpm-workspace.yaml` 或 `.git`，兜底到用户主目录 `~/.tachikoma`）；
  - 全面替换 `apps/cli/src/sparks-cli.ts` 和 `apps/cli/src/cli.ts` 中的 `process.cwd()` 默认回退，确保全局单点持久化。

### 1.2 问题 2：抖音视频无真实 ASR 转录，仅落文案
- **现状与痛点**：
  - `apps/douyin-sync/src/pipeline.ts` 中 `customTranscribe` 回调始终未在 CLI 中接线，全仓没有任何 ASR 模块；
  - 视频作品落盘内容直接取 `item.desc`，导致大量只说不写或文案仅含表情符号的视频在转录稿中内容几乎为空，多模态情报完全失真；
  - 过去的方案依赖重型 Python 环境（Whisper/SenseVoice 脚本），环境脆弱、跨进程调用痛苦且难以跨平台常驻。
- **第一性解决方案（拒绝旧 Python 技术栈，全 TypeScript / 现代原生接口）**：
  - 引入轻量模块 `apps/douyin-sync/src/asr.ts`（或放入 `@tachikoma/core`），设计全 TypeScript 原生转录器；
  - 转录引擎策略采用现代标准化 HTTP 协议与环境变量驱动：
    1. **OpenAI Audio Transcription API 标准兼容**（支持本地部署的 Whisper.cpp / Faster-Whisper / Ollama / LocalAI / Magpie 或远程兼容接口，使用 `POST /v1/audio/transcriptions`，通过原生 `fetch` 与 `FormData` 直出，零重型外部依赖）；
    2. **降级保底防御**：若 ASR 服务离线或未配置，平滑降级使用视频文案 `item.desc`，并带有清晰状态标示，绝不中断采集管道；
  - 在 `apps/cli/src/cli.ts` 真正实例化并传入 `customTranscribe`，完成端到端闭环接线。

---

## 2. 详细改动清单（What）

1. **规约与设计**：
   - `openspec/changes/workspace-anchor-and-ts-asr-pipeline/`（proposal.md, design.md, tasks.md）
2. **模块 1：工作空间根与数据库路径自适应锚定**：
   - 在 `packages/core/src/path.ts` 或 `packages/core/src/workspace.ts` 中实现 `resolveWorkspaceRoot()` 与 `getTachikomaDataDir()`；
   - 重构 `apps/cli/src/sparks-cli.ts` 与 `apps/cli/src/cli.ts`，消灭裸 `process.cwd()` 默认值；
3. **模块 2：TypeScript 原生 ASR 音频转录客户端**：
   - 提取视频音频轨道或直接投递音频文件至兼容 OpenAI `/v1/audio/transcriptions` 接口；
   - 具备配置化 endpoint 与可选密钥（支持 `TACHIKOMA_ASR_BASE_URL` / `OPENAI_BASE_URL`）；
   - 在 `apps/douyin-sync/src/pipeline.ts` 接入真实 ASR 执行逻辑，并在 `apps/cli/src/cli.ts` 组装注入；
4. **单元测试与验证**：
   - 针对根目录自适应解析的测试用例；
   - 针对 ASR 客户端的 Mock HTTP 转录测试及降级容错测试。
