# proposal: Tachikoma 健壮性深水区治理、链路闭环与冗余代码收敛

## 1. 变更背景与核心痛点
近期 Tachikoma 在高频演进中修复了翻页游标、精度丢失、页内脚本执行、图文过滤与 ASR 侧车迁移等一系列 Bug。经过对三大轨道（长文剪藏、碎片流、收藏夹同步）、两大生命周期及数据全链路的全面审计（详见 `AUDIT_REPORT.md`），暴露出项目初期在多层容灾协作契约上不够严密，存在以下核心缺陷：
1. **P0 致命逻辑短路（图文作品提取）**：在 `public.ts` 中，同源 XHR 因上下文被平台过滤 (`images_base`) 时，代码先执行了 DOM 兜底；因为页面几乎总能从 `.desc` 或 `og:title` 捞出一两句标题文本，`candidate` 被提前赋值，外层 `finalExtraction` 发生短路，导致为图文专门设计的作品页 note 重试链路 (`retryViaNotePage`) 永远无法被触发，多图图集作品沦为仅有标题文本的残缺卡片；
2. **P1 增量断点检查点未接线（生产假死）**：`reconciliation.ts` 实现了 `sync_checkpoints` 数据表与 `getCheckpoint` / `setCheckpoint`，但在生产核心循环 `syncCollections` 中从未被调用，每次轮询均从游标 0 开始，若配置 `max_per_folder`，后续作品永远无法同步；
3. **P1 碎片升格元数据契约倒挂**：单条抖音灵感通过 `promoteSparkToGhost` 升格落盘至 `Ghost/_raw/douyin/sparks/` 时，Frontmatter 中的 `entry` 与 `media_type` 被机械赋予 `manual-notes` 与 `article`，丢失了 `douyin-sync` 与 `video` / `gallery` 真实属性；
4. **P1 长文剪藏标题墓碑校验缺失**：`web-clipper` 仅前置校验了 URL 墓碑，清洗出文章标题后漏了二次标题墓碑对账（易被带随机参数的跳转链接穿透）；
5. **P2 无下载模式 CDN 多线路容灾缺失**：未开启 `downloadMedia` 时仅直连单条首选 CDN URL，若该节点异常直接导致 ASR 降级跳过；
6. **P2 死代码与冗余代码散落**：跨模块存在无用导入、废弃的 SSR 变量探测、`profileDir` 持久化上下文产生僵尸空白 Tab、Rust Guard 路径硬编码等。

## 2. 变更目标与技术设计
1. **重构图文 note 页重试契约**：
   - 提取策略严格收敛：若提取结果置信度为 `dom-fallback` 或失败原因为 `images-filtered`，且当前非 note 作品页，强制调用 `retryViaNotePage`；
   - 仅在 note 重试依然未获取到结构化数据时才真正回退为 DOM 兜底；
2. **接通增量断点 Checkpoint**：
   - 在 `syncCollections` 循环拉取收藏夹前，通过 `getCheckpoint(db, "collect", folder.id)` 读取上次游标；
   - 在抓取完成后通过 `setCheckpoint` 更新游标，真正实现大收藏夹流式增量推进；
3. **纠正单条抖音灵感升格契约**：
   - 在 `sparkToIngestionResult` 中，若来源为抖音（URL 或标签含 `#抖音`），赋予 `entry: "douyin-sync"`，根据标签或多模态属性准确赋予 `mediaType: "video" | "gallery"`；
4. **补齐长文剪藏标题墓碑校验**：
   - 在 `web-clipper` 的 `purifyArticle` 产出标题后，对 `purified.title` 进行 `isTombstoneIgnored({ title: purified.title }, tombstones)` 二次拦截；
5. **清理全仓无用 import、死代码与防御八股**：
   - 移除无用 import 与死函数，修复 `bridge.ts` 中的空白 Tab 残留；
   - 全量回归测试，确保 162+ 单测 100% 绿灯。
