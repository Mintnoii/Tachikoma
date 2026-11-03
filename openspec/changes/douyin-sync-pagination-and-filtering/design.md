# 设计：全量分页聚合与规则过滤引擎

## 1. 原 Python 逻辑对齐分析

原 Python 项目核心位于 `Desktop/douyin-sync/core/auto_sync.py`：
- `collections`：列表，精确匹配 `name in collections`
- `name_keywords`：列表，子串包含 `any(kw in name for kw in name_keywords)`
- 过滤掉空关键字：`kw.strip()` 防止 `"" in name` 恒真误判全量
- 匹配合并：精确命中 ∪ 关键字命中，并按 `collects_id` 字典去重
- 若二者均为空：不进入同步，或者提示无匹配，绝不无脑全拉

在 TypeScript 中以纯函数规范实现，零全局副作用，零全局状态。

## 2. 详细设计

### D1: 纯函数全量游标分页器 (`client.ts`)

```ts
/**
 * 分页拉取所有收藏夹列表（直至 has_more 为 false 或防环上限）
 */
export async function fetchAllCollectFolders(
  bridge: BrowserBridge,
  pageSize = 30,
  maxPages = 20
): Promise<DouyinCollectionFolder[]> {
  const folders: DouyinCollectionFolder[] = [];
  const seenIds = new Set<string>();
  let cursor = 0;
  let hasMore = true;
  let page = 0;

  while (hasMore && page < maxPages) {
    const res = await fetchCollectList(bridge, cursor, pageSize);
    for (const f of res.folders) {
      if (!seenIds.has(f.id)) {
        seenIds.add(f.id);
        folders.push(f);
      }
    }
    hasMore = res.hasMore;
    cursor = res.cursor;
    page++;
  }

  return folders;
}

/**
 * 分页拉取指定收藏夹内的所有作品（支持 maxCount 限制）
 */
export async function fetchAllCollectAwemes(
  bridge: BrowserBridge,
  collectsId: string,
  maxCount = 0, // 0 = 不限制
  pageSize = 20,
  maxPages = 50
): Promise<DouyinAwemeItem[]> {
  const items: DouyinAwemeItem[] = [];
  const seenIds = new Set<string>();
  let cursor = 0;
  let hasMore = true;
  let page = 0;

  while (hasMore && page < maxPages) {
    const res = await fetchCollectAwemes(bridge, collectsId, cursor, pageSize);
    for (const it of res.items) {
      if (!seenIds.has(it.id)) {
        seenIds.add(it.id);
        items.push(it);
        if (maxCount > 0 && items.length >= maxCount) {
          return items.slice(0, maxCount);
        }
      }
    }
    hasMore = res.hasMore;
    cursor = res.cursor;
    page++;
  }

  return items;
}
```

### D2: 规则过滤引擎 (`filter.ts`)

```ts
export interface CollectFilterRules {
  collections?: string[];
  nameKeywords?: string[];
}

/**
 * 纯函数：根据精确名称与关键字包含规则筛选收藏夹，并去重
 */
export function filterCollectFolders(
  folders: readonly DouyinCollectionFolder[],
  rules: CollectFilterRules
): DouyinCollectionFolder[] {
  const exactNames = new Set((rules.collections ?? []).map((s) => s.trim()).filter(Boolean));
  const rawKeywords = (rules.nameKeywords ?? []).map((s) => s.trim()).filter(Boolean);

  if (exactNames.size === 0 && rawKeywords.length === 0) {
    return [];
  }

  const matched: DouyinCollectionFolder[] = [];
  const matchedIds = new Set<string>();

  for (const folder of folders) {
    const name = folder.name.trim();
    const isExact = exactNames.has(name);
    const isKeyword = rawKeywords.some((kw) => name.includes(kw));

    if ((isExact || isKeyword) && !matchedIds.has(folder.id)) {
      matchedIds.add(folder.id);
      matched.push(folder);
    }
  }

  return matched;
}
```

### D3: 配置文件契约与自适应加载 (`config/sync_rules.yaml`)

创建 `apps/douyin-sync/config/sync_rules.yaml`：
```yaml
# 抖音收藏夹同步过滤规则
# 精确匹配（完全一致）
collections:
  - AI存档
  - 心理学存档

# 关键字匹配（名称包含任一关键字即命中）
name_keywords:
  - 存档

# 单个收藏夹同步上限（0 为不限）
max_per_folder: 0
```

加载策略：
1. 优先读取 CLI 参数 `--keywords` / `--folders`；
2. 其次自动加载 `apps/douyin-sync/config/sync_rules.yaml`；
3. 若指定了 `--collect-id`（单个 ID 同步），直接豁免规则；
4. 若以上皆无（空规则），必须有**安全守卫告警**并停止，拒绝将全量不相干收藏夹（如“吃吃吃吃吃”）同步落盘。

### D4: 死代码清理方案

1. 物理删除 `apps/douyin-sync/config/note_prompt.md`；
2. 彻底移除 `cdpEndpoint`：
   - `types.ts` 中的 `DouyinSyncOptions.cdpEndpoint`；
   - `bridge.ts` 中的 `opts.cdpEndpoint` 与 `chromium.connectOverCDP`；
   - `pipeline.ts` / `cli.ts` 中的冗余参数；
3. `types.ts` 中的 `DouyinExtractionSource` 移除 `"render-data"`。

## 3. 验证计划

- **单测**：
  - 测试 `filterCollectFolders` 精确匹配、关键字匹配、空关键字防御、重复去重；
  - 测试 `fetchAllCollectFolders` 与 `fetchAllCollectAwemes` 的翻页边界（mock 模拟 hasMore 游标翻页与防环）；
- **实测**：
  - 读取真实账号 26 个收藏夹，验证过滤后只命中包含“存档”的夹子（如 面试存档、AI存档、认知存档、理财存档等）；
  - 验证排除无关夹子（如 吃吃吃吃吃、装备、Mbti、沙东、旅游等）；
  - 验证全量拉取下单夹（如「面试存档」）能穿透第 10 条抓满 19 条。
