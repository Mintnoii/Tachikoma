# Design: Tachikoma 架构设计与关键技术选型

- **Proposal**: `tachikoma-ingest-engine`
- **Status**: Draft

---

## 1. 核心技术选型 (Technology Stack)

遵照全机系统最高门禁（起手编码审美），坚决杜绝手写胶水与过度抽象，技术栈选型如下：

| 领域 / 职责 | 选型 | 理由与决策 |
|---|---|---|
| **工程结构** | pnpm Monorepo | 原生 workspace 支持，分层清晰，拒绝幽灵依赖 |
| **运行时** | Node.js (v20+) / TS | 原生 TypeScript 直接执行（`tsx` / `tsup` 构建），零环境门槛 |
| **路径治理** | `pathe` | 全机强制：统一抹平 Windows 反斜杠陷阱，严禁手搓字符串拼接 |
| **流式与集合变换** | `radash` | 全机强制：消灭过程式 for 循环，消灭原生 try-catch（统一 `tryit`） |
| **强类型契约校验** | `@sinclair/typebox` | 源头强契约：输入输出 Schema 化，杜绝业务层到处散落 `Array.isArray` |
| **DOM 清洗与解析** | `@mozilla/readability` + `jsdom` | 工业级标准化文章正文提取，抗营销号与杂质 |
| **浏览器自动化** | `playwright-core` (or CDP) | 保持轻量，复用本机已有的 Chromium/Profile，绕过复杂签名风控 |
| **守护进程** | Rust (`windows-subsystem = "windows"`) | 单文件 1MB 原生 `.exe`，物理消除黑框，带命名 Mutex 防多开，彻底淘汰 VBS |

---

## 2. 系统核心抽象 (Core Architecture)

### 2.1 Universal Ingestion Facade
```typescript
export interface IngestionResult {
  sourceUrl: string;
  mediaType: "article" | "tweet" | "video" | "gallery";
  title: string;
  author: {
    name: string;
    id?: string;
  };
  content: string; // 标准 Markdown
  rawAssets?: string[]; // 本地图片/音视频持久化路径
  metadata: Record<string, unknown>;
}
```

### 2.2 路由与分流策略
1. **抖音/快手短视频与图文**（`v.douyin.com`, `douyin.com`）：路由至 `MediaPod`；
2. **X / Twitter**（`x.com`, `twitter.com`）：路由至 `TweetPod`（抽取推文与媒体）；
3. **微信公众号 / 技术博客 / 普通网页**（`mp.weixin.qq.com`, `github.com` 等）：路由至 `WebPod`（CDP/Readability 净化）。

---

## 3. Ghost 知识库对接契约

输出文件严格落入 `Ghost/_raw/<category>/`，Frontmatter 格式遵照 RFC-2026-0922：

```markdown
---
title: "作品或文章标题"
entry: "tachikoma"
media_type: "article | gallery | video"
source_url: "https://..."
created_at: 2026-10-31T02:45:00+08:00
tags: [tachikoma, ingest]
---

## 核心摘要 / OCR 文字稿 / 正文内容
...
```
