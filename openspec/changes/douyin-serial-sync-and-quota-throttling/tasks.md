# Tasks: 抖音增量同步串行队列化、配额节流与 Zero-Dirty-Card 纯净契约

- [x] **Task 1: 并发控制改造为严格串行队列**
  - [x] 1.1 在 `apps/douyin-sync/src/pipeline.ts` 中废弃 `syncCollectionsInternal`、`syncAuthorsInternal` 和 `syncMixesInternal` 内的 `Promise.all` 批量并发。
  - [x] 1.2 改用严格串行循环（`for...of`），保证单视频音频下载 + WAV 转码 + Whisper ASR 推理完全完成后才流转至下一条。

- [x] **Task 2: 批次消化配额（Batch Quota）支持**
  - [x] 2.1 在 `apps/douyin-sync/src/types.ts` 和配置中支持 `batchSize` / `maxCount` 参数；
  - [x] 2.2 当待消费的 `unsyncedItems` 数量超过单次批次上限时，按时间顺序仅处理当前批次配额数，游标安全推进，避免单周期无节制吞吐。

- [x] **Task 3: 第一性 Zero-Dirty-Card 纯净契约重构**
  - [x] 3.1 彻底删除 `pipeline.ts` 中视频转录失败时的降级落盘逻辑（如'💡 说明 [文案描述备选]'）；视频若未能获取到有效音频转录，直接抛出错误或跳过落盘，绝不调用 `persistIngestionResult` 生成 markdown，也绝不在 db 中 `markSynced`，保持 Ghost 绝对纯洁；
  - [x] 3.2 图集 OCR 同样：若全部 OCR 失败，严禁写入 Ghost，直接报错/中止；
  - [x] 3.3 失败的作品不入对账库，下次同步时天然被 `filterUnsynced` 识别为未同步，天然支持无限次自动重试；
  - [x] 3.4 彻底清理之前引入的 degraded 相关复杂暂存设计（包含 `reconciliation.ts` 的 status 列、`getSyncRecord`、`isCardMissingTranscript` 以及 CLI 的 `--repair`/`--retranscribe` 冗余设计），回归极简契约。

- [x] **Task 4: 单元测试与端到端沙箱回归验证**
  - [x] 4.1 编写/更新 `tests/douyin-sync.test.ts` 与 `tests/douyin-author-and-mix.test.ts`，新增 Task 2.6/2.7/2.11/2.12/2.13/2.14 验证串行执行顺序、批次上限控制、Zero-Dirty-Card 拦截与天然自动重试；
  - [x] 4.2 运行 `pnpm test` 全量 174 个测试用例 100% 通过。
