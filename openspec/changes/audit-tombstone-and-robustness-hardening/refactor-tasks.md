# Tasks: 全仓编码审美重构

- [x] Task 1: 浏览器生命周期作用域提纯 (apps/web-clipper & apps/douyin-sync)
  - [x] 1.1 在 `apps/web-clipper/src/fetcher.ts` 实现函数式 `withBrowserContext<T>`，重构 `fetchWithBrowser`，消除 `let browser/page` 声明与裸写 `try/finally`
  - [x] 1.2 在 `apps/douyin-sync/src/public.ts` 消除 `let browser = null` 阶梯模板，使用生命周期作用域接管 `fetchPublicAwemeItem`
  - [x] 1.3 重构 `apps/douyin-sync/src/public.ts` 中的 `evaluate` 页面提取逻辑：消灭 `for of Object.keys` 游标、消灭 `catch {}`，采用声明式查找

- [x] Task 2: 消灭裸写 try/catch 样板与命令式 for 游标
  - [x] 2.1 重构 `apps/douyin-sync/src/pipeline.ts`（行 212, 255, 325）：将裸写 `try/catch` 替换为 `radash.tryit`，保持错误传播与日志纯净
  - [x] 2.2 重构 `apps/cli/src/cli.ts`：将输出打印中的 `for (const line of rawLines)`、`for (const point of keyPoints)` 重构为声明式流式输出
  - [x] 2.3 重构 `apps/cli/src/sparks-cli.ts`：将列表渲染中的 `for of` 遍历重构为清晰的声明式映射，消除 `parseTagsInput` 中的 `Array.isArray` 胶水
  - [x] 2.4 重构 `packages/core/src/db/sparks.ts` 与 `packages/core/src/tombstone.ts`：将 `for of` 行遍历替换为 `radash.unique` / `sift` 函数式管道

- [x] Task 3: 提取安全的通用 JSON 解析器消灭掩耳盗铃
  - [x] 3.1 在 `packages/core/src/utils/json.ts` 抽象 `safeJsonParse<T>(raw, fallback)`，统一依托 `jsonrepair` + `tryit`
  - [x] 3.2 替换全仓散落的手搓 JSON 解析逻辑

- [x] Task 4: 质量验证
  - [x] 4.1 运行 `pnpm test` 确保 128 项单测全部绿灯通过
  - [x] 4.2 运行 `pnpm typecheck` 确保类型契约 0 报错
  - [x] 4.3 运行 `pnpm build` 确保 CLI 打包正常
