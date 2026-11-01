# Tasks: 工作区路径锚定与 TypeScript 原生 ASR 音频转录管线

- [x] Task 1: 路径锚定与数据目录自适应发现器
  - [x] 在 `packages/core/src/workspace.ts` 中实现 `resolveWorkspaceRoot()` 与 `getTachikomaDataPaths()`
  - [x] 在 `packages/core/src/index.ts` 中导出相关方法
  - [x] 编写单测 `tests/workspace.test.ts` 验证向上寻访、环境变量与主目录兜底逻辑
  - [x] 重构 `apps/cli/src/sparks-cli.ts` 与 `apps/cli/src/cli.ts`，消除 5 处裸 `process.cwd()`

- [x] Task 2: TypeScript 原生 ASR 音频转录客户端
  - [x] 在 `apps/douyin-sync/src/asr.ts` 中实现基于 OpenAI Audio Transcription 标准 API 的转录器 `createAudioTranscriber()`
  - [x] 支持本地或远端端点 (`TACHIKOMA_ASR_BASE_URL`，默认适配 Magpie / Local Whisper)
  - [x] 原生 FormData 构建，通过 `radash.tryit` 优雅容错降级
  - [x] 在 `apps/douyin-sync/src/index.ts` 导出 ASR 模块

- [x] Task 3: 管道与 CLI 端到端接线
  - [x] 在 `apps/cli/src/cli.ts` 的 `sync douyin` 逻辑中实例化 ASR 转录器并注入 `customTranscribe`
  - [x] 优化 `apps/douyin-sync/src/pipeline.ts`，在有真实转录稿时清晰标明 `[音频转录]`，未转录时标明 `[文案描述备选]`
  - [x] 编写 ASR 客户端与 Pipeline 的集成单元测试 `tests/asr.test.ts`

- [x] Task 4: 运行回归全量测试并出示验证报告
  - [x] 运行 `pnpm test` 确保原有 108 个测试 + 新增测试 100% 通过
  - [x] 运行 `pnpm typecheck` 保证 TypeScript 零类型错误
