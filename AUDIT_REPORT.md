# Tachikoma 全盘深度健康与健壮性审计报告

> **审计执行时间**：2026-11-03  
> **审计环境**：Windows 11 (Node 22 / pnpm / Rust 1.96 / ffmpeg 9.0)  
> **测试状态**：162 passed / 0 failed (100% 通过)  
> **TypeScript 检查**：`tsc --noEmit` 0 error  

---

## 摘要与执行概览

本报告对 Tachikoma 统一多模态情报摄入引擎开展了全盘覆盖式深度健康与健壮性审计。本次审计穿透三大业务轨道、两大生命周期流向以及全链路数据流转，重点针对近期高频演进与 Bug 修复（翻页游标、精度丢失、页内脚本执行、图文过滤、ASR 本地侧车迁移等）的周边边界开展了源码级探查。

审计发现：
1. **P0 致命逻辑短路漏洞（图文作品提取）**：在 `apps/douyin-sync/src/public.ts` 中，同源 XHR 因上下文被平台过滤 (`images_base`) 时，代码先执行了 DOM 兜底；因为页面普遍带有标题文本，`candidate` 被提前赋值，外层 `finalExtraction` 发生短路，**导致作品页 note 重试链路 (`retryViaNotePage`) 永远无法被触发**，多图图集作品沦为仅有标题文本的残缺卡片；
2. **P1 生产断点游标功能假死（未接线死代码）**：`reconciliation.ts` 中实现了 `sync_checkpoints` 表及 `getCheckpoint`/`setCheckpoint`，但在 `syncCollections` 生产流水线中**从未被调用**。每次同步恒定从 `cursor = 0` 开始，若配置 `max_per_folder`，每次只取第一页，后续新作品因被截断而永远无法同步；
3. **P1 碎片升格元数据倒挂与契约不一致**：`packages/core/src/sparks/promote.ts` 中的 `sparkToIngestionResult` 硬编码 `isTool ? "manual-research" : "manual-notes"` 和 `isMeme ? "gallery" : isTweet ? "tweet" : "article"`。当单条抖音灵感升格至 Ghost 时，物理文件落入 `Ghost/_raw/douyin/sparks/`，但 Frontmatter 中的 `entry` 沦为 `manual-notes`、`media_type` 沦为 `article`，完全丢失了 `douyin-sync` 和 `video`/`gallery` 真实属性；
4. **P2 登录态探活未接线与无下载模式 CDN 容灾降级**：`PublicAwemeSessionOption.hasSession` 未被调用；未开启 `downloadMedia` 时仅直连单条首选 CDN URL，若该节点异常直接导致 ASR 降级跳过；
5. **历史测试断言漂移已修复**：`tests/cli.test.ts` 因未同步 `capture` 命令更名导致 1 项测试断言失败，已就地修复，全仓 162 项单测 100% 恢复绿灯。

---

## 1. 三大轨道深度健康状况审计

### 1.1 轨道 A: 长文/推文/外部链接摄入 (`apps/web-clipper`, `tachikoma capture`)
- **健康度与良好设计**：
  - 严格遵循函数式管道：`url -> 墓碑防重 -> fetchHtml() -> purifyArticle() -> formatToRFC2026Markdown() -> persistIngestionResult()`；
  - `purifier.ts` 对微信公众号等复杂 DOM 具备专项增强：`cleanHiddenStyles` 清除隐藏样式防 Readability 误删、`extractMetaDescription` 反转义多层实体解码（支持 `\x..` 16进制转义与 HTML textarea 反转义）、短正文（<200字）优先回退 `#js_content` 原生 DOM；
  - 墓碑前置校验 `loadGhostTombstones` 能在下载渲染前拦截已放弃炼化的目标 URL。
- **发现的代码级隐患**：
  - **标题墓碑校验缺失** (`apps/web-clipper/src/pipeline.ts:16-24`)：
    `clipUrl` 仅对入参 `url` 与跳转后 `finalUrl` 执行了 `isTombstoneIgnored({ url })`，未对清洗提取出的 `purified.title` 进行墓碑标题校验（`isTombstoneIgnored({ title: purified.title }, tombstones)`）。若同一文章通过不同引荐参数或短链进入且链接未被记录，只要标题已在墓碑账本中，本应被过滤却会穿透抓取；
  - **文件名非法控制字符未彻底过滤** (`packages/core/src/formatter.ts:97-103`)：
    `toSafeFileTitle` 仅正则替换了 `[\\/:*?"<>|]`，若文章标题含有换行符 `\r\n` 或低位 ASCII 控制字符 `[\x00-\x1f]`，在 Windows 下落盘可能触发系统调用异常，应在清理前将所有空白与换行统一收敛为单个空格。

### 1.2 轨道 B: 随笔灵感与单条作品碎片 (`apps/cli` sparks, `tachikoma spark`, `sparks.db`)
- **健康度与良好设计**：
  - 基于 Node.js 22 原生 `node:sqlite`（`DatabaseSync`）初始化 WAL 模式与 `busy_timeout = 5000`，彻底消灭 Windows 并发锁库风险；
  - FTS5 全文索引通过 SQLite 触发器（`sparks_ai` / `sparks_ad` / `sparks_au`）实现无感原子同步，并在应用层自动融合 CJK `LIKE` 模糊匹配，解决了 `unicode61` 分词器对无空格中文子串检索偏弱的问题；
  - 严格遵守全机最高红线：单条抖音链接通过 `ingestDouyinToSparks` 内部消化至 `sparks.db`，100% 隔离真实 Ghost 底座。
- **发现的代码级隐患**：
  - **单条抖音升格 Frontmatter 契约降级** (`packages/core/src/sparks/promote.ts:32-40`)：
    详见第 2 节。单条抖音灵感升格落盘至 `Ghost/_raw/douyin/sparks/`，但 `entry` 与 `media_type` 被机械赋予 `manual-notes` 与 `article`；
  - **`spark distill` 认知提示偏差** (`apps/cli/src/cli.ts:276`)：
    CLI 回执提示 `提取结果来自 DOM 兜底，正文可能不完整，建议后续 spark distill 补齐`。然而 `spark distill <id>` 底层仅对已持久化的 `sparkRecord.content` 文本调用大模型提纯分类与标签，并无根据 `sourceUrl` 重新抓取或补全转录的能力。

### 1.3 轨道 C: 抖音收藏夹对账同步 (`apps/douyin-sync`, `tachikoma sync`)
- **健康度与良好设计**：
  - 彻底切断原 Python 胶水依赖，归还为 TypeScript 原生 + Rust 侧车守护架构；
  - 收藏夹规则匹配引擎（`filterCollectFolders` 与 `sync_rules.yaml`）支持精确名称与关键字包含规则取并集去重，且在规则全空时设置安全门禁阻断全量拉取，守护知识库纯净；
  - 游标全量翻页突破单次 10 条限制；detail 接口与收藏夹接口全线携带 `device_platform=webapp&aid=6383`；
  - 本地 ASR 转录服务由 Rust Guard 自动托管拉起与 10s TCP 探活，音频流通过 `toWhisperWav` 自动转码 16kHz mono WAV，并注入错词表 prompt（上限 64 条 verified 专有名词）。
- **发现的代码级隐患**：
  - **DOM 兜底提前截断重试（严重缺陷）**：详见第 4.1 节；
  - **增量对账断点游标未接线**：详见第 4.2 节；
  - **无下载模式下 CDN 多线路容灾缺失**：详见第 4.4 节。

---

## 2. 两大流向与生命周期审计

```text
[录入端]
  ├── URL / 文本 / 梗图 / 单条抖音 ──> [Sparks 碎片流 (sparks.db)] ──> distill ──> promote ──> [Ghost/_raw/]
  └── 长文推文 / 抖音收藏夹对账 ──────────────────────────────────────────────> [Ghost/_raw/ (不可变严肃知识底座)]
```

### 2.1 临时碎片流 (`sparks.db -> distill -> promote`)
- **生命周期状态迁移**：
  - `seed`（种子态）：极速入库，免去重度分类摩擦；
  - `growing`（生长态）：通过 `tachikoma spark status <id> growing` 或标签聚合聚拢成微主题簇；
  - `evergreen`（常青态）：通过 `tachikoma spark promote <id>` 升格入库或重要标记。
- **6+1 MOC 体系提纯与自然生长**：
  - 核心领域：`soul`（明心见性）、`literature`（咬文嚼字）、`life`（人间烟火）、`arsenal`（实用工具库）、`meme`（熬夜背梗）、`sparks`（有趣却无用）及 `custom/*`；
  - `getEmergingClusters` 能够按阈值（默认 >=5）自动嗅探达到聚类规模的高频标签，反哺微领域生长。

### 2.2 严肃知识底座流 (`Ghost/_raw/` 不可变规范)
- **目录路由契约执行情况**：
  - 长文/推文剪藏：`Ghost/_raw/articles/<title>.md`；
  - 抖音收藏夹同步：`Ghost/_raw/douyin/<folderName>/<title>.md`；
  - 单条抖音灵感升格：`Ghost/_raw/douyin/sparks/<title>.md`；
  - 其他灵感升格：`Ghost/_raw/articles/<title>.md`。
- **不可变对账防线**：
  - 双重拦截机制：第一道由本地 SQLite `synced_awemes` 表记录 `aweme_id` 与 `sha256`；第二道由 `loadGhostTombstones` 自动穿透至 Ghost 根目录加载 `.cache/ignored.json`，确保用户主动在 Ghost 标记放弃炼化的素材不再反复回流。

---

## 3. 数据全链路审计（录入、处理、输出、存放）

| 链路环节 | 组件与模块 | 状态评级 | 关键发现与审计结论 |
| :--- | :--- | :---: | :--- |
| **录入: URL 解析** | `extractDouyinUrlOrId` | 良好 | 支持普通 URL、短链 `v.douyin.com`、包含口令的剪贴板字符串及纯数字 ID 提取；但末尾 `trimmed.replace(/\D/g, "")` 存在将非 ID 纯数字（如年份 "2026"）提取为 `awemeId` 的微小风险，建议限定只收敛 `\d{15,22}`。 |
| **录入: 浏览器通道** | `withBrowserPage` / `withPersistentBrowserContext` | 优秀 | 统一接管 Playwright 生命周期，支持 headless、viewport、mobile/touch 适配，彻底修复了历史僵尸进程残留缺陷。 |
| **录入: 媒体与防盗链** | `cdn.ts` / `media.ts` | 良好 | `DOUYIN_CDN_HEADERS` 携带 `User-Agent`、`Referer` 与 `Range: bytes=0-` 抹平 CDN 403；`toWhisperWav` 依托 `ffmpeg` 转换为 16kHz WAV。 |
| **处理: 正文清洗** | `ArticlePurifier` | 优秀 | 移除无效选择器，提取语言标签，微信公众号隐藏样式修复完整，多层 HTML 实体与换行反转义严密。 |
| **处理: 语音转录** | `createAudioTranscriber` | 良好 | OpenAI Audio 兼容格式请求，错词表 prompt 注入（verified 去重上限 64 条）；转录超时未完全向 `options.timeoutMs` 开放。 |
| **处理: 视觉多模态** | `ocrGallery` / `ocrImage` | 优秀 | Magpie 网关视觉请求，Base64 Data URL 自动转换，Markdown 按张数结构化分页聚合。 |
| **处理: 语义提纯** | `distillWithLLM` / `safeJsonParse` | 优秀 | `jsonrepair` 容错自愈非标 JSON，标签数量限制在 2~3 个最具穿透力的高维标签，杜绝碎词堆叠。 |
| **输出: 格式与指纹** | `formatToRFC2026Markdown` | 优秀 | 内容统一抹平为 LF 后计算 SHA-256，Frontmatter 递归清理 `undefined` 字段防止 yaml 序列化崩溃。 |
| **存放: 路径与数据库** | `persistIngestionResult` / `openSparksDb` | 优秀 | `pathe` 抹平路径；目录自动递归创建；数据库开启 WAL 与 busy_timeout。 |

---

## 4. 健壮性隐患、周边遗留漏洞与死代码深度剖析

### 4.1 【重大逻辑缺陷】DOM 兜底提前返回导致 note 页重试短路
- **代码位置**：
  - `apps/douyin-sync/src/public.ts:272-295` (`extractFromPageContext`)
  - `apps/douyin-sync/src/public.ts:401-403` (`extractAwemeFromLivePage`)
- **缺陷机理**：
  在 `extractFromPageContext` 中：
  ```typescript
  // 1. 页内同源 XHR
  const xhrCandidate = xhrResult?.ok && xhrResult.data ? deepFindAwemeItem(xhrResult.data) : null;
  if (xhrCandidate) {
    return { candidate: xhrCandidate, source: "in-page-xhr", confidence: "high", ... };
  }
  // 2. DOM 启发式兜底（代码注释写着：XHR 与重试都失败后的最后手段）
  const domFallback = (await page.evaluate(toPageScript(DOM_FALLBACK_SCRIPT), undefined));
  if (domFallback) {
    return { candidate: domFallback, source: "dom", confidence: "dom-fallback", ... };
  }
  ```
  而在外层 `extractAwemeFromLivePage` 中：
  ```typescript
  const extraction = interceptedRef.data ? ... : await extractFromPageContext(page, resolvedId);
  // 图文被上下文过滤时，改用作品页（note）重试一次：detail 只在作品页上下文放行
  const finalExtraction = extraction.candidate
    ? extraction
    : await retryViaNotePage(page, resolvedId, extraction, timeoutMs);
  ```
- **后果**：
  当遇到图文作品时，从普通页面发起 XHR 会被平台返回 `filter_reason: "images_base"` 拦截。随后 `extractFromPageContext` 立即执行 DOM 兜底。因为页面 DOM 几乎总能从 `.desc` 或 `og:title` 读出一段文本，`domFallback` 必然返回对象！外层的三元表达式判定 `extraction.candidate` 存在，**直接短路返回了残缺的 DOM 文本，而本应挽救图文的 `retryViaNotePage` 彻底成了永远无法执行的死代码**！
- **修复方案**：
  在 `extractAwemeFromLivePage` 中，若提取结果为 `confidence === "dom-fallback"` 或失败原因为 `images-filtered`，且当前页面非 note 页，必须强制调用 `retryViaNotePage`，仅在 note 重试依然未获取到结构化数据时才真正回退为 DOM 兜底。

### 4.2 【功能未闭环】增量断点检查点（Checkpoints）在生产中未接线
- **代码位置**：
  - `apps/douyin-sync/src/reconciliation.ts:95-124` (`getCheckpoint`, `setCheckpoint`)
  - `apps/douyin-sync/src/pipeline.ts:260-344` (`syncCollections`)
- **缺陷机理**：
  `reconciliation.ts` 中维护了 `sync_checkpoints` 数据表并导出了读写方法。但在核心同步主链路 `syncCollections` 中，`getCheckpoint` 与 `setCheckpoint` 从未被引入和调用。每次轮询收藏夹，`fetchAllCollectAwemes` 均从 `cursor = 0` 开始向后抓取。
- **后果**：
  若用户在 `sync_rules.yaml` 中配置了 `max_per_folder = 10`，系统每次只会拉取前 10 条作品（早已在历史同步中标记）。由于游标无法推进，后面的第 11~100 条未同步作品永远无法被同步程序拉取到。

### 4.3 【契约不一致】单条灵感升格时的 Frontmatter 属性降级
- **代码位置**：
  - `packages/core/src/sparks/promote.ts:32-40` (`sparkToIngestionResult`)
- **缺陷机理**：
  ```typescript
  const isTool = spark.type === "tool";
  const isMeme = spark.type === "meme" || Boolean(spark.assetPath);
  const isTweet = Boolean(spark.sourceUrl && /(twitter\.com|x\.com)/i.test(spark.sourceUrl));

  const entry: EntryType = isTool ? "manual-research" : "manual-notes";
  const mediaType: MediaType = isMeme ? "gallery" : isTweet ? "tweet" : "article";
  ```
- **后果**：
  当用户将单条通过 `tachikoma capture <douyin_url>` 录入的灵感通过 `tachikoma spark promote <id>` 升格时，虽然文件落盘路径由 `inferSparkCategory` 正确路由到 `Ghost/_raw/douyin/sparks/<title>.md`，但卡片元数据中的 `entry` 被固化为 `manual-notes`，`media_type` 固化为 `article`，完全丢失了该素材属于 `douyin-sync`、`video` 或 `gallery` 的核心身份。

### 4.4 【容灾薄弱】无下载模式下 CDN 备份线路失效
- **代码位置**：
  - `apps/douyin-sync/src/pipeline.ts:140-146` (`processAweme`)
- **缺陷机理**：
  在 `downloadMedia: false`（默认非下载模式）时，`videoSource` 仅取 `item.videoPlayUrl`（即第 1 条 CDN 地址），并未像下载模式那样调用 `downloadFirstAvailable`。如果首选 CDN 节点因防盗链、跨域或 DNS 波动返回 403，`createAudioTranscriber` 会直接失败跳过，导致语音转录完全降级为文本摘要，无法发挥多线路容灾能力。

### 4.5 【死代码与冗余清理清单】
1. **未使用的导入声明 (Unused Imports)**：
   - `apps/cli/src/cli.ts:9`：未使用的 `fetchPublicAwemeItem`；
   - `apps/douyin-sync/src/pipeline.ts:5`：未使用的 `DEFAULT_DESKTOP_USER_AGENT`；
   - `apps/douyin-sync/src/pipeline.ts:7`：未使用的 `fetchCollectList`, `fetchCollectAwemes`；
   - `apps/douyin-sync/src/filter.ts:2`：未使用的 `dirname`；
   - `packages/core/src/sparks/extractor.ts:14-17`：未使用的 `normalizeSparkCluster`, `normalizeGhostCluster`, `normalizeSparkType`, `normalizeSparkTags`；
2. **死脚本与冗余属性**：
   - `apps/douyin-sync/src/public.ts:125-130`：`SSR_EXTRACT_SCRIPT` 中依然保留已被证实恒为 `undefined` 的 `__INITIAL_STATE__` 与 `__INIT_PROPS__` 探测代码；
   - `apps/douyin-sync/src/public.ts:23`：`PublicAwemeSessionOption.hasSession` 未被消费；
   - `apps/douyin-sync/src/types.ts:57-58`：`DouyinSyncOptions` 中 `sqlitePath` 与 `dbPath` 存在二义性双重定义；
   - `apps/douyin-sync/src/bridge.ts:93`：在已有 `profileDir` 的持久化上下文中，Playwright 默认已打开 `pages()[0]`，此处无条件调用 `context.newPage()` 会产生一个挂在后台的空空白标签页；
3. **Rust Guard 跨机路径硬编码**：
   - `packages/guard/src/main.rs:26, 234-237`：硬编码了 `USERPROFILE`、`C:\\Users\\wangqing`、`Desktop\\Tachikoma` 与 `Desktop\\Ghost\\_raw`，未对接 TS 侧支持的 `TACHIKOMA_HOME` 与 `GHOST_RAW_DIR` 环境变量。

---

## 5. 优化改进建议与优先级路线

### P0（高危缺陷，建议立即排期落地）
1. **重构 `public.ts` 的 note 页重试逻辑**：
   调整 `extractFromPageContext` 与 `extractAwemeFromLivePage` 的协作契约，同源 XHR 遇到 `images_base` 过滤且尚未在 note 页时，**优先执行 `retryViaNotePage`**；仅在 note 重试失败后才允许执行 `DOM_FALLBACK_SCRIPT`，彻底解开图文抓取短路问题；
2. **对齐单条灵感升格的 RFC-2026 契约**：
   修改 `sparkToIngestionResult`：当检测到灵感来源为抖音（URL 或标签含 `#抖音`）时，`entry` 正确赋予 `douyin-sync`，`mediaType` 根据标签或属性正确赋予 `video` 或 `gallery`。

### P1（健壮性与完整性加固）
3. **接线 `sync_checkpoints` 断点游标机制**：
   在 `syncCollections` 循环拉取收藏夹作品时，结合 `getCheckpoint` 确定起始游标，并在完成一批同步后通过 `setCheckpoint` 持久化最新游标，真正实现大收藏夹流式增量推进；
4. **长文剪藏补充标题墓碑防重**：
   在 `web-clipper/src/pipeline.ts` 中，DOM 纯化得到 `purified.title` 后，补充 `isTombstoneIgnored({ title: purified.title }, tombstones)` 校验。

### P2（代码卫生与配置对齐）
5. **清理全仓冗余 import 与死脚本代码**：
   移除前文排查出的 5 处无用导入，移除 `SSR_EXTRACT_SCRIPT` 中的历史死字段探测，统一 `DouyinSyncOptions` 为 `sqlitePath`；
6. **Rust Guard 环境变量对齐**：
   在 `packages/guard/src/main.rs` 中优先读取 `TACHIKOMA_HOME` 与 `GHOST_RAW_DIR` 环境变量，与 Node/TS 核心路径契约保持一致。
