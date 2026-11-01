# Tasks: Tachikoma 深度体检缺陷修复与健壮性加固

- [x] Task 1: 修复 Ghost 墓碑账本路径锚定与穿透传递 (P0)
  - [x] 1.1 在 `packages/core/src/tombstone.ts` 中实现 `resolveGhostVaultRoot(path)`，智能识别 `Ghost/_raw` 或子路径并回溯至 Ghost 仓库根目录，使 `.cache/ignored.json` 能被精准读取
  - [x] 1.2 在 `apps/douyin-sync/src/pipeline.ts` 的 `syncCollections` 流程中传递 `options.outputDir` 到 `filterUnsynced`
  - [x] 1.3 更新 `tests/tombstone.test.ts` 验证智能路径回溯能力

- [x] Task 2: 修复 Playwright 浏览器进程泄露 (P1)
  - [x] 2.1 优化 `apps/web-clipper/src/fetcher.ts`，确保 `ownBrowser` 启动时在 `finally` 阶段可靠执行 `browser.close()`
  - [x] 2.2 优化 `apps/douyin-sync/src/bridge.ts` 与 `public.ts`，确保浏览器实例与上下文完整回收

- [x] Task 3: SQLite 注入 WAL 模式与并发防锁配置 (P1)
  - [x] 3.1 在 `packages/core/src/sparks/db.ts`（`openSparksDb`）中注入 `PRAGMA journal_mode = WAL;` 与 `PRAGMA busy_timeout = 5000;`
  - [x] 3.2 在 `apps/douyin-sync/src/reconciliation.ts`（`openReconcilerDb`）中同样注入 WAL 与 busy_timeout

- [x] Task 4: 引入 `jsonrepair` 增强 LLM 脏数据自愈 (P1)
  - [x] 4.1 在 `packages/core` 安装并引入 `jsonrepair`
  - [x] 4.2 在 `packages/core/src/sparks/distill.ts` 中替换原生 `JSON.parse`，支持自动修复非标/截断 JSON

- [x] Task 5: 全量回归测试与构建验收
  - [x] 5.1 运行 `pnpm test` 确保所有既有与新增测试用例 100% 通过
  - [x] 5.2 运行 `pnpm typecheck` 与 `pnpm build` 确认零类型报错与构建产物可用
