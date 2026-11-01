# Proposal: 规范化抖音摄入分工：收藏夹子目录归位与单条链接转入 Sparks 军械库

- **Name**: `douyin-folder-routing-and-sparks-ingestion`
- **Date**: 2026-11-01
- **Status**: Proposed
- **Author**: qing & Pi (Coordinator)
- **Background**:
  - 用户指出：Ghost 知识库中 `Ghost/_raw/douyin/` 必须严格按照收藏夹名称组织子目录（如 `AI存档/`、`认知存档/`、`心理学存档/` 等），保持严肃第二大脑的分类纯净；
  - 聊天中（如微信投递）直接发送的单条抖音链接，天然脱离收藏夹分类上下文，不应直接平铺塞入 `Ghost/_raw/douyin/` 根部造成知识库杂乱；
  - 第一性分工：单条抖音链接由 Tachikoma 内部消化，转为 **Sparks 战术灵感**（记录作者、标题、文案或语音转录，归入 `sparks.db`），而 `syncCollections` 增量同步时自动获取收藏夹名称并落入 `Ghost/_raw/douyin/<收藏夹名称>/` 子目录。

---

## 1. 详细设计 (What)

### 1.1 收藏夹自动分目录归位 (`syncCollections`)
- 在 `fetchCollectList` 获取收藏夹时保留 `folder.name`（如 `AI存档`、`认知存档`）；
- 在遍历抓取 `fetchCollectAwemes(bridge, folder.id)` 时，将 `folderName` 传递给 `processAweme`；
- `processAweme` 落盘路径调整为 `outputDir/douyin/<folderName>/<title>.md`；
- 如果找不到收藏夹名称或未指定，保底回退为 `outputDir/douyin/default/` 或 `outputDir/douyin/`。

### 1.2 单条抖音链接（微信/CLI 直接投递）转为 Sparks 灵感
- 在 `apps/cli/src/cli.ts` 的 `ingest` 逻辑中：
  - 当 URL 命中抖音链接时，直接调用抖音解析获取作品元数据与音视频转录；
  - **不落盘至 Ghost**，而是将内容自动组装并调用 `refineAndCreateSpark`（或 `createSpark`）录入 `Tachikoma` 的本地军械库数据库；
  - 灵感标签自动打上 `#抖音 #短视频 #[作者名]`，分类归入 `fleeting` 或由 LLM 提纯归入 6+1 MOC 主题簇；
  - 提示用户：`⚡ [Tachikoma] 单条抖音灵感已录入随身军械库 (未污染 Ghost 收藏夹)`，附带提示未来可通过 `tachikoma spark promote <id>` 自主升格。

---

## 2. 任务清单 (Tasks)

- [x] Task 1: 优化 `apps/douyin-sync/src/pipeline.ts`，支持按收藏夹名称创建子目录（`Ghost/_raw/douyin/<收藏夹名>/`）
- [x] Task 2: 改造 `apps/cli/src/cli.ts` 中的单条抖音摄入逻辑，改为录入 Sparks 战术军械库内部消化
- [x] Task 3: 运行回归验证，确保 114 个单测与构建正常通过
