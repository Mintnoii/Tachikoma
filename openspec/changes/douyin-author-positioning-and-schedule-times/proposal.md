# Proposal: 补齐创作者定位关键词过滤与守护计划时刻调度 (douyin-author-positioning-and-schedule-times)

## 1. 背景与核心价值
在旧版 Python `douyin-sync` 中，有两项经过实战检验的高价值工程细节：
1. **作者主页定位关键词过滤 (`positioning_keywords`)**：
   部分优质技术/AI创作者也会偶尔发布生活随笔、旅行或娱乐日常。通过在作者规则中配置 `positioning_keywords: ["面试", "agent", "大模型", "RAG"]`，系统在拉取作者主页作品时，若作品标题/文案未包含任何定位关键词，直接过滤跳过，从而保持第二大脑 Ghost 知识库作者专栏的高纯度。
2. **差异化计划时刻门控 (`author_times` / `mix_times`)**：
   收藏夹适合高频轮询（如每 30 分钟），而合集专栏与作者主页历史较长，适合配置特定时刻（如 `["12:00", "20:00", "23:00"]`）才触发同步，避免每个周期无谓扫描作者主页和合集，显著节约 API 调用与系统负载。

## 2. 差异记录（非落地范围）
根据用户确认与架构演进，以下两项旧版特性**显式记入文档，暂不予在当前版本实现**：
- **`note_enhance` (LLM 结构化增强与抽帧)**：旧版在摄入期调 LLM 进行总结，但 Ghost 系统拥有下游专属的演化炼化流水线（`Ghost/.pi/lib/pipeline.ts`），`_raw/` 底座应遵循 100% 只读原声不可变原则，保留裸转录原稿最纯粹。
- **`downloadMedia` (全量本地音视频与封面落地)**：旧版默认把几百 MB 的 `.mp4` 文件保存在本地，易导致硬盘空间迅速膨胀。当前版本坚持“内存流式抽音频转录、不落盘巨型视频文件”的轻量化设计。

## 3. 落地实施规划
1. **作者定位过滤**：
   - 在 `DouyinAuthorRule` 中增加 `positioning` 与 `positioning_keywords` 字段；
   - 在 `syncAuthorsInternal` 处理作者作品列表时，若配置了关键词列表，过滤出命中任一关键词的作品才进入增量消费；
2. **计划时刻调度门控 (`author_times` / `mix_times`)**：
   - 提取纯函数 `isScheduleTimeDue(now: Date, lastSyncAt: number | null, times?: string[]): boolean`；
   - 在 `syncDouyinAll` 统一同步入口中，校验当前时间点是否满足计划时刻要求；若未到期，跳过作者/合集同步；
3. **文档沉淀**：
   - 在 `README.md` 与 `AGENTS.md` 中记录已实现特性与暂不迁移特性的设计权衡。
