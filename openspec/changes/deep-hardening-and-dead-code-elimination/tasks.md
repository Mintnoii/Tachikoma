# tasks: Tachikoma 健壮性深水区治理、链路闭环与冗余代码收敛

## 1. P0: 修复图文 note 页重试逻辑短路
- [x] 1.1 修改 `apps/douyin-sync/src/public.ts` 中的 `extractAwemeFromLivePage` 与 `extractFromPageContext` 契约：
  - 遇到 `images_base` 过滤或提取置信度仅为 `dom-fallback` 时，只要当前页面非 note 页，必须优先调用 `retryViaNotePage`；
  - 仅在 note 重试依然未获取到结构化数据时才真正回退为 DOM 兜底；
- [x] 1.2 编写或更新单元测试，针对 `images-filtered` 与 `dom-fallback` 场景确保 note 页重试绝不被提前短路。

## 2. P1: 增量断点检查点（Checkpoints）接线与闭环
- [x] 2.1 在 `apps/douyin-sync/src/pipeline.ts` 中导入 `getCheckpoint` 和 `setCheckpoint`；
- [x] 2.2 在 `syncCollections` 轮询收藏夹拉取 `fetchAllCollectAwemes` 时，传入已持久化的 `checkpoint.cursor`；
- [x] 2.3 抓取完成后调用 `setCheckpoint` 持久化最新游标；
- [x] 2.4 在 `tests/douyin-sync.test.ts` 中补充断点续拉回归测试。

## 3. P1: 单条灵感升格 RFC-2026 契约校准
- [x] 3.1 修改 `packages/core/src/sparks/promote.ts` 中的 `sparkToIngestionResult`：
  - 检测是否为抖音灵感（`spark.sourceUrl` 包含 douyin.com 或标签含 `#抖音`）；
  - 若为抖音，设置 `entry: "douyin-sync"`；根据 `spark.tags` 或内容特征设置 `mediaType: "gallery" | "video"`；
- [x] 3.2 更新相关升格单元测试，断言 `entry` 与 `media_type` 契约精准对齐。

## 4. P1: 长文剪藏标题墓碑二次校验
- [x] 4.1 在 `apps/web-clipper/src/pipeline.ts` 中，DOM 纯化得到 `purified.title` 后，补充 `isTombstoneIgnored({ title: purified.title }, tombstones)` 拦截校验；
- [x] 4.2 补充单元测试，验证通过不同 URL 输入但标题命中墓碑时能够被正确跳过。

## 5. P2: 死代码清理与代码卫生收敛
- [x] 5.1 清理 `apps/cli/src/cli.ts`、`apps/douyin-sync/src/pipeline.ts`、`apps/douyin-sync/src/filter.ts`、`packages/core/src/sparks/extractor.ts` 中的无用 imports；
- [x] 5.2 清理 `apps/douyin-sync/src/public.ts` 中废弃的 SSR 变量探测代码（`__INITIAL_STATE__`, `__INIT_PROPS__`）；
- [x] 5.3 修复 `apps/douyin-sync/src/bridge.ts` 持久化上下文中 `context.newPage()` 导致的僵尸空白 Tab 残留；
- [x] 5.4 运行 `pnpm test` 与 `pnpm build`，确保所有单测 100% 绿灯且类型检查与构建无错误。
