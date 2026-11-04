# Proposal: 抖音增量同步串行队列化、配额节流与 Zero-Dirty-Card 纯净契约 (douyin-serial-sync-and-quota-throttling)

## 1. 背景与核心痛点
在 `Tachikoma` 的抖音增量同步（`apps/douyin-sync`）中，当前实现存在两大致命缺陷：
1. **`Promise.all` 瞬时并发打崩 ASR**：
   在 `syncCollectionsInternal`、`syncAuthorsInternal` 和 `syncMixesInternal` 中，所有未同步的作品（几十件甚至上百件）被无脑丢进 `Promise.all(unsyncedItems.map(item => processAweme(...)))`。
   音频下载与本地 Whisper（端口 8000）推理是典型的重量级 CPU/GPU 任务，瞬时并发洪峰直接造成 HTTP 请求超时或拒绝，触发 `createAudioTranscriber` 的静默降级（退化为作者文案），导致推入 Ghost 的 Markdown 正文中无转录文字稿。
2. **缺乏单批次消化上限控制（Batch / Quota）**：
   旧版 Python `douyin-sync` 具备克制的配额机制（如每周期只消化未下载的前 5~20 条），而新版若合集包含 60+ 篇，会一口气全部拉取并尝试在一轮中吞完。
3. **降级暂存与对账污染（Dirty Card 问题）**：
   若视频转录失败降级为原作者文案落盘，不仅污染了第二大脑 Ghost 知识库（产生无实质转录的残次卡片），且若在 SQLite 对账锁定则后续不再重试；若引入复杂状态机（degraded / repair / retranscribe）又违背第一性极简审美。

## 2. 变更目标与设计规约
1. **串行/受控并发队列（Serial / Controlled Queue）**：
   - 彻底废除 `Promise.all` 批量并发 `processAweme`，改用严格串行流（`for...of`），单件音视频下载+转录完成后方可处理下一件，给本地 Whisper 充分的推理时间。
2. **周期配额控制（Batch Quota / Max Items per Run）**：
   - 支持在规则配置 `sync_rules.yaml` 及 CLI 参数中设定 `batch_size` / `batchSize`，未消化的作品安全保留游标，留待下个周期增量消费。
3. **第一性 Zero-Dirty-Card 纯净契约**：
   - 彻底删除视频转录失败时的降级落盘逻辑（如'💡 说明 [文案描述备选]'）；视频若未能获取到有效音频转录，直接抛错/跳过，绝不调用 `persistIngestionResult` 生成 markdown，也绝不在 SQLite 中 `markSynced`，保持 Ghost 绝对纯洁；
   - 图集 OCR 同样：若全部 OCR 失败，严禁写入 Ghost，直接抛错/中止；
   - 失败的作品未在 db 标记对账，下次同步时天然被 `filterUnsynced` 识别为未同步，天然支持无限次自动重试；
   - 彻底清理之前引入的 degraded 相关复杂暂存设计，回归 Zero-Dirty-Card 极简契约。

## 3. 影响范围
- `apps/douyin-sync/src/pipeline.ts`
- `apps/douyin-sync/src/reconciliation.ts`
- `apps/douyin-sync/src/types.ts`
- `apps/douyin-sync/config/sync_rules.yaml`
- `apps/cli/src/cli.ts`
- `tests/douyin-sync.test.ts`
- `tests/douyin-author-and-mix.test.ts`
