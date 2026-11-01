# Tasks: 规范化抖音摄入分工：收藏夹子目录归位与单条链接转入 Sparks 军械库

- [x] Task 1: 优化 `apps/douyin-sync/src/pipeline.ts` 与 `types.ts`
  - [x] 1.1 `DouyinSyncOptions` 增加 `folderName?: string` 选项契约
  - [x] 1.2 `processAweme` 扩展接收 `folderName`，落盘 category 设为 `folderName ? 'douyin/' + folderName : 'douyin'`
  - [x] 1.3 `syncCollections` 遍历获取 `folder.name` 并传入 `processAweme`，实现 `Ghost/_raw/douyin/<收藏夹名>/` 自动路由
  - [x] 1.4 新增 `fetchAwemeDetailWithTranscript` 纯函数，用于单条抖音作品解析与语音转录提取

- [x] Task 2: 改造 `apps/cli/src/cli.ts` 单条抖音摄入逻辑
  - [x] 2.1 抽取 `ingestDouyinToSparks` 纯函数，解析作品与音频转录后调用 `createSpark`
  - [x] 2.2 自动注入 `#抖音 #短视频 #[作者名]` 标签，初始分类归入 `fleeting`（种子态）
  - [x] 2.3 友好输出战术灵感入库提示，附带 `tachikoma spark promote <id>` 自主升格引导，绝不污染 Ghost/_raw 知识库

- [x] Task 3: 自动化测试与构建验证
  - [x] 3.1 `tests/douyin-sync.test.ts` 补充子目录路由 (Task 2.8)、`syncCollections` 分流 (Task 2.9) 与转录提取 (Task 2.10) 单测
  - [x] 3.2 `tests/cli.test.ts` 补充 `ingestDouyinToSparks` 沙盒入库及 Ghost 防污染断言
  - [x] 3.3 运行 `pnpm typecheck` 0 报错通过
  - [x] 3.4 运行 `pnpm build` 成功构建 CLI 产物
  - [x] 3.5 运行 `pnpm test` 118 个单测全量通过
