# Tasks: 全仓高重复度代码消除与极致瘦身 (Streamline Tasks)

- [x] Task 1: 浏览器生命周期统一收敛到 packages/core (消灭近 100 行重复模板)
  - [x] 1.1 在 `packages/core/src/browser.ts` 实现统一的 `withBrowserPage<T>(options, fn)`，统一接管 CDP/Launch、无痕 Context、UserAgent、Page 与确定性资源回收
  - [x] 1.2 在 `packages/core/src/index.ts` 导出该函数
  - [x] 1.3 重构 `apps/web-clipper/src/fetcher.ts`：彻底删除本地手写的 `withBrowserContext`，直接调用 `@tachikoma/core` 的 `withBrowserPage`
  - [x] 1.4 重构 `apps/douyin-sync/src/public.ts`：彻底删除本地手写的 `withDouyinAnonymousSession`，直接调用 `@tachikoma/core` 的 `withBrowserPage`

- [x] Task 2: 抖音 URL / AwemeId 提取纯函数收敛到 packages/core
  - [x] 2.1 将 `extractDouyinUrlOrId` 收敛至 `packages/core/src/utils/douyin.ts`
  - [x] 2.2 简化内部逻辑，统一导出并在 `apps/douyin-sync` 与 CLI 共享

- [x] Task 3: CLI 终端格式化提纯 (消除手搓 ANSI 与控制台格式化样板)
  - [x] 3.1 引入 `consola` 或 `picocolors` 规范 CLI 控制台高亮与格式化输出
  - [x] 3.2 简化 `apps/cli/src/sparks-cli.ts` 与 `apps/cli/src/cli.ts` 中的手搓打印样板代码

- [x] Task 4: 质量与瘦身验收
  - [x] 4.1 运行 `pnpm test` 保证所有单测 100% 绿灯
  - [x] 4.2 运行 `pnpm typecheck` 与 `pnpm build`
  - [x] 4.3 统计 `git diff --stat` 验证代码行数净减少
