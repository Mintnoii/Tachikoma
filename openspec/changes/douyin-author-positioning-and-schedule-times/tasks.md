# Tasks: 补齐创作者定位关键词过滤与守护计划时刻调度

- [x] **Task 1: 创作者定位关键词过滤 (Author Positioning Keywords Filter)**
  - [x] 1.1 在 `apps/douyin-sync/src/types.ts` 中的 `DouyinAuthorRule` 扩展 `positioning?: string` 与 `positioning_keywords?: string[]`（兼容 `positioningKeywords`）；
  - [x] 1.2 在 `apps/douyin-sync/src/filter.ts` 的 `loadSyncRulesConfig` 中解析该字段；
  - [x] 1.3 在 `apps/douyin-sync/src/pipeline.ts` 的 `syncAuthorsInternal` 中，如果作者规则配置了关键词列表，使用不区分大小写的包含匹配过滤 `items`，打印过滤统计日志，未命中的作品跳过不予处理。

- [x] **Task 2: 计划时刻门控纯函数与三轨差异化调度 (Schedule Times Gating)**
  - [x] 2.1 在 `apps/douyin-sync/src/filter.ts` 中实现纯函数 `isScheduleTimeDue(now: Date, lastSyncAt: number | null, times?: string[]): boolean`，支持 `HH:MM` 格式计划点与跨午夜时间判定；
  - [x] 2.2 在 `SyncRulesConfig` 中增加 `author_times?: string[]` 与 `mix_times?: string[]`；
  - [x] 2.3 在 `syncDouyinAll` 调度中，结合对账库中记录的上次同步时间戳（`getLatestSyncTime`）执行门控判定，未到期时跳过作者或合集拉取；
  - [x] 2.4 CLI 暴露 `--force-all`，在指定单项参数或传 `--force-all` 时豁免时刻门控。

- [x] **Task 3: 架构文档与差异设计记录**
  - [x] 3.1 在 `README.md` 与 `AGENTS.md` 中记录 Python 版迁移差异决策（记入 `note_enhance` 与 `downloadMedia` 不予迁移的第一性考量）。

- [x] **Task 4: 单元测试覆盖与验证**
  - [x] 4.1 编写 `tests/douyin-author-and-mix.test.ts` 验证作者定位关键词过滤与时刻门控纯函数；
  - [x] 4.2 运行 `pnpm test` 全量 177 项单元测试 100% 通过。
