# Design: Tachikoma 战术灵感军械库 (Sparks Tactical Arsenal) 技术设计

- **Proposal**: `tachikoma-tactical-sparks`
- **Status**: Proposed
- **Type**: Architecture & Schema Design

---

## 1. 架构与数据流 (Architecture & Data Flow)

```text
[输入] 终端命令 / 拖入图片 / 网页链接 / 纯文本金句段子
  │
  ▼
apps/cli (tachikoma spark)
  │
  ├─> 1. 判断输入形态 (URL / 本地文件路径 / 纯文本)
  │
  ├─> 2. 轻量提纯管道 (LLM One-shot Pipeline)
  │     ├─ 若为图片: 本地 OCR / 视觉模型提取核心文案 + 画面风格标签
  │     ├─ 若为工具链接: 抓取 Readability/README，提取「一句话用途 + 杀手级特性」
  │     └─ 若为纯文本: 提取文案出处/情绪标签，不重写原句
  │
  ├─> 3. 存储层 (SQLite 单表 + FTS5)
  │     └─ 写入 sparks 表 (status: 'seed')
  │
  └─> 4. 查询与检索 (FTS5 + 标签过滤 + 状态生命周期)
        └─ CLI 秒级直出、关键词模糊检索
```

---

## 2. 核心数据模型 (TypeBox Schema)

```typescript
import { Type, Static } from '@sinclair/typebox';

export const SparkTypeSchema = Type.Union([
  Type.Literal('quote'),    // 金句、诗词、文案
  Type.Literal('tool'),     // 好玩开源工具、CLI神兵利器、实用网站
  Type.Literal('joke'),     // 段子、冷幽默、神级吐槽
  Type.Literal('meme'),     // 梗图、架构手绘、视觉资产
  Type.Literal('fleeting')  // 其他即兴随笔闪念
]);

export const SparkStatusSchema = Type.Union([
  Type.Literal('seed'),       // 种子态：刚随手存入，未经分类或仅有粗标签
  Type.Literal('growing'),    // 生长态：同类标签聚集，自然涌现为微主题簇
  Type.Literal('evergreen')   // 常青态：高频调用或标为神级收藏
]);

export const SparkRecordSchema = Type.Object({
  id: Type.String({ description: 'KSUID 或 Nanoid' }),
  type: SparkTypeSchema,
  status: SparkStatusSchema,
  title: Type.String({ description: '提纯后的一句话标题或亮点' }),
  content: Type.String({ description: '原始文案、正文或工具描述' }),
  sourceUrl: Type.Optional(Type.String({ description: '原始链接或仓库地址' })),
  assetPath: Type.Optional(Type.String({ description: '如果为本地图片/梗图，存储在 assets/memes/ 相对路径' })),
  tags: Type.Array(Type.String(), { description: '扁平标签集合，如 ["#CLI", "#Rust", "#终端"]' }),
  cluster: Type.Optional(Type.String({ description: '自然生长涌现出的微领域主题簇名称' })),
  accessCount: Type.Number({ default: 0, description: '调用与检索命中频次' }),
  createdAt: Type.String({ description: 'ISO 时间戳' }),
  updatedAt: Type.String({ description: 'ISO 时间戳' })
});

export type SparkRecord = Static<typeof SparkRecordSchema>;
```

---

## 3. SQLite 表结构与 FTS5 全文索引

```sql
CREATE TABLE IF NOT EXISTS sparks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'seed',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  asset_path TEXT,
  tags TEXT NOT NULL,          -- JSON Array: '["#CLI", "#Rust"]'
  cluster TEXT,
  access_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 全文检索虚拟表 (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS sparks_fts USING fts5(
  id UNINDEXED,
  title,
  content,
  tags,
  tokenize='unicode61'
);

-- 自动触发器：同步更新 FTS 表
CREATE TRIGGER IF NOT EXISTS sparks_ai AFTER INSERT ON sparks BEGIN
  INSERT INTO sparks_fts(id, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
END;
```

---

## 4. 生命周期管理（种子到主干）与升格通道

1. **种子 (Seed)**：
   - 录入即种子，默认进入仓库，不需要任何分类整理负担；
2. **生长 (Growing / Cluster)**：
   - 当具有相同或高频关联标签的记录达到阈值（如某个标签达到 5 条），在 CLI 看板或列表展示中自动收拢为一个**微主题簇**；
3. **升格 (Promote to Ghost)**：
   - 当执行 `tachikoma spark promote <id>` 时：
   - 提取该 Spark 的原始数据，格式化为标准 RFC-2026 Markdown 格式；
   - 写入 `Ghost/_raw/articles/` 或 `_raw/tools/`；
   - 本地 Spark 标记为已归档或关联外部链接，实现与严肃第二大脑的丝滑衔接。
