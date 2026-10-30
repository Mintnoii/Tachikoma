# Tachikoma 多模态情报摄入引擎 — 架构重构与开发验收报告

> **日期**：2026-10-31  
> **状态**：Phase 1 ~ Phase 4 核心工程落地完成，单测全量通过  
> **定位**：Ghost 第二大脑不可变底座（`_raw/`）唯一多模态摄入中枢

---

## 1. 架构拓扑与 Monorepo 重构

针对原旧版 `douyin-sync`（Python 过程式胶水）和 `ob-clipper`（依赖第三方 Obsidian 插件），本次重构严格践行 **第一性原理与库优先武器库**，建立了现代 TypeScript Monorepo：

```text
Tachikoma/
├── apps/
│   ├── cli/             # 统一入口门面：tachikoma ingest <URL> / sync
│   ├── douyin-sync/     # 抖音收藏夹与作者作品增量轮询、多模态 OCR 转录、Node 原生 SQLite 对账
│   └── web-clipper/     # 基于 Readability + JSDOM + Turndown 的极简网页/推文提纯引擎
├── packages/
│   ├── core/            # 强契约底座（TypeBox Schema、RFC-2026-0922 格式化、SHA256、沙盒持久化）
│   └── guard/           # Rust 编写的零控制台黑框静态守护进程
├── tests/               # 隔离沙盒综合单测套件（零污染生产知识库）
└── openspec/            # OpenSpec 架构提案驱动规范
```

---

## 2. 核心架构审美与技术选型重构对比

| 维度 | 旧版方案（Python / 旧插件） | Tachikoma 现代 TypeScript 方案 |
| :--- | :--- | :--- |
| **编程范式** | 面向对象 / class / this 原型链样板 | 真正原子化纯函数管道（`clipUrl`, `fetchHtml`, `syncSingleAweme`, `syncCollections`, `ocrGallery`, `openReconcilerDb`），彻底消灭面向对象伪装与包装对象工厂 |
| **底层类型契约** | 无类型 / 运行时隐式崩溃 | 依托 `@sinclair/typebox` 静态类型推断与扁平 Schema 强制校验 |
| **路径与系统抹平** | 原生 `os.path` / Windows 反斜杠拼接 | 100% 依托 `pathe` 与全局 `@dotagents/utils/path.ts` |
| **异步流与容错** | 繁琐的 `try/catch` 过程式样板 | 纯函数流式依托 `radash.tryit` 解构 `[err, res]`，消灭深层嵌套 |
| **增量对账存储** | 散落的 JSON / 文本锁文件 | Node.js 22+ 原生 `node:sqlite`（`DatabaseSync`）持久化状态机与游标 |
| **视觉与转录** | 本地笨重 Whisper/Python 依赖 | 纯 TS 轻量客户端直连本地 Magpie（`auto/gemini-3.8-flash`）视觉多模态接口 |
| **网页提纯** | 手搓正则与字符串截取 | 纯函数式 DOM 规则清洗 + Readability + 增强型 Turndown 转译 |
| **宿主守护** | 脆弱易被杀毒软件拦截的 `.vbs` 脚本 | Rust `windows_subsystem = "windows"` 编译出的原生静态二进制守护 |

---

## 3. 测试验证与隔离安全证据

为杜绝任何开发调试过程中对真实知识库 `Ghost/_raw/` 产生脏数据污染，所有单测全部执行在 `tests/sandbox/` 隔离目录中。

```bash
$ pnpm test

> node --import tsx --test tests/**/*.test.ts

▶ Phase 4: Tachikoma CLI Interface Tests
  ✔ CLI commands and options definition (0.5872ms)
✔ Phase 4: Tachikoma CLI Interface Tests (1.248ms)
▶ Task 1.3: Core Schema & RFC Formatting in isolated sandbox
  ✔ Valid IngestionResult conforms to schema (2.5179ms)
  ✔ Invalid IngestionResult throws descriptive error (1.1019ms)
  ✔ formatToRFC2026Markdown creates compliant frontmatter and sha256 (2.5589ms)
  ✔ persistIngestionResult writes to isolated sandbox without touching Ghost (9.8451ms)
✔ Task 1.3: Core Schema & RFC Formatting in isolated sandbox (24.1094ms)
▶ Phase 2: Douyin Sync Sub-App Comprehensive Tests
  ✔ Task 2.1: DouyinClient & BrowserBridge normalizes API responses (1.9246ms)
  ✔ Task 2.2: SyncReconciler SQLite incremental tracking and checkpoints (1003.8107ms)
  ✔ Task 2.3: MagpieGalleryOCR formats OpenAI-compatible vision requests (7.1729ms)
  ✔ Task 2.4: DouyinPipeline end-to-end sandbox run (13.7238ms)
✔ Phase 2: Douyin Sync Sub-App Comprehensive Tests (1040.0636ms)
▶ Phase 3: Web Clipper Sub-App Comprehensive Tests
  ✔ Task 3.1 & 3.2: ArticlePurifier purifies WeChat article DOM (81.2742ms)
  ✔ Task 3.2: ArticlePurifier identifies tweet mediaType (9.436ms)
  ✔ Task 3.3: WebClipperPipeline end-to-end sandbox run (24.8651ms)
✔ Phase 3: Web Clipper Sub-App Comprehensive Tests (549.263ms)
ℹ tests 16
ℹ suites 0
ℹ pass 16
ℹ fail 0
ℹ duration_ms 2053.829
```

---

## 4. 使用说明与快速启动

### 4.1 单条内容快速剪藏
```bash
# 剪藏微信文章或普通网页
pnpm --filter @tachikoma/cli exec tsx src/cli.ts ingest "https://mp.weixin.qq.com/s/xxxx"

# 剪藏单条抖音视频/图集
pnpm --filter @tachikoma/cli exec tsx src/cli.ts ingest "https://www.douyin.com/video/xxxx"
```

### 4.2 抖音收藏夹定时增量对账同步
```bash
# 轮询已配置账号的所有收藏夹
pnpm --filter @tachikoma/cli exec tsx src/cli.ts sync
```
