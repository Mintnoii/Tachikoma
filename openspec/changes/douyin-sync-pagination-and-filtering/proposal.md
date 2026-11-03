# 抖音收藏夹同步：全量分页循环与规则过滤落地

## 为什么

原 Python 项目（`Desktop/douyin-sync/config.yml` 与 `core/auto_sync.py`）拥有成熟的收藏夹同步调度规则：
1. **收藏夹全量获取与翻页**：逐页循环 `cursor`，不遗漏超过 10 个的收藏夹；
2. **规则过滤**：
   - `collections`：精确匹配收藏夹名称（如 `["AI存档", "心理学存档"]`）；
   - `name_keywords`：模糊匹配名称子串（如 `["存档"]`）；
   - 二者取并集按 ID 去重；未命中则不予拉取；
3. **作品全量分页拉取**：单夹超过 10 条作品时，循环 `has_more` 与 `cursor` 直至全部拉取。

在重构成 TypeScript 时，该套能力被严重简写：
- `fetchCollectList` 只调了一次（默认 count=10），用户实际 26 个收藏夹被截断丢失 16 个；
- `fetchCollectAwemes` 同样只调了一次（默认 count=10），单夹超过 10 条作品被截断丢失；
- `pipeline.ts` 中完全没有做任何收藏夹过滤（若不传 `-c`，直接把拉到的全部夹子一股脑落盘）；
- 没有读取或迁移原 Python 的配置规则，导致用户预期的“按关键字包含同步”彻底失效。

## 目标

1. **自动分页拉取全量收藏夹**：`fetchAllCollectFolders` 内部通过 `while (hasMore)` 游标循环拉满所有收藏夹（实测 26 个）；
2. **自动分页拉取夹内作品**：`fetchAllCollectAwemes` 内部通过 `while (hasMore)` 游标循环拉取所有作品，支持 `maxPerFolder` 上限配置（默认 0 不限）；
3. **收藏夹规则匹配**：
   - 新增配置文件 `apps/douyin-sync/config/sync_rules.yaml`（或环境/传参统一解析），迁移原 `config.yml` 的 `auto_sync` 过滤规则；
   - 支持 `collections`（精确匹配）与 `name_keywords`（子串包含），二者并集去重；
   - CLI 支持 `--keywords <kws...>` / `--folders <names...>` 覆盖或默认读取配置文件；
   - 安全门禁：未指定 `-c` 且未匹配到任何允许的规则时，明确拦截并提示，严禁无脑全量灌库；
4. **清理遗留死代码**：
   - 移除孤立的 `note_prompt.md`（旧 Python 版总结 prompt）；
   - 清理穿透 4 层未曾启用的 `cdpEndpoint` 死参数；
   - 从 `types.ts` 中移除已删除提取实现的 `render-data` 死类型；
   - 清理 `.gitignore` 中 Python 注释遗留；
5. **完整回归验证**：
   - 验证 26 个收藏夹全量列出；
   - 验证命中关键字 `存档` 的收藏夹被精准过滤；
   - 验证单夹（如「面试存档」19 条）完整翻页拉取，不再截断；
   - 验证增量对账与 Ghost 墓碑跳过机制正常运行。

## 非目标

- 不接入合集（mixes）和作者主页（authors）轮询（保持增量收敛聚焦于收藏夹同步）；
- 不做额外的定时调度器（常驻守护由 `packages/guard` 或外部 cron 接管）。

## 影响面

| 模块 | 变更说明 |
|---|---|
| `apps/douyin-sync/src/client.ts` | 新增 `fetchAllCollectFolders` 与 `fetchAllCollectAwemes` 全量分页纯函数 |
| `apps/douyin-sync/src/filter.ts` | 新建纯函数：收藏夹精确名与关键字过滤合并算法 |
| `apps/douyin-sync/src/pipeline.ts` | 接入全量分页与过滤逻辑，移除 `cdpEndpoint` |
| `apps/douyin-sync/src/types.ts` | 移除 `render-data`，增加 `SyncRulesConfig` 相关类型 |
| `apps/douyin-sync/config/sync_rules.yaml` | 新建持久化规则配置文件（对齐原 Python 配置心智） |
| `apps/cli/src/cli.ts` | `sync` 命令支持 `--keywords` / `--folders`，移除 `cdpEndpoint` |
| `tests/` | 增加分页聚合、规则过滤等高覆盖度纯函数单元测试 |
