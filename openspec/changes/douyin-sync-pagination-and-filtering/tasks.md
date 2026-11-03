# 任务清单

## 1. 翻页与分页聚合函数实现

- [x] 1.1 `client.ts` 新增 `fetchAllCollectFolders`：通过 `hasMore` 与 `cursor` 循环完整拉取所有收藏夹
- [x] 1.2 `client.ts` 新增 `fetchAllCollectAwemes`：通过 `hasMore` 与 `cursor` 循环完整拉取单夹作品，支持 `maxCount`
- [x] 1.3 防环机制：设置 `maxPages` 与 `seenIds` 去重，防止服务端死循环

## 2. 规则过滤引擎与配置加载

- [x] 2.1 新建 `apps/douyin-sync/src/filter.ts`：实现 `filterCollectFolders` 纯函数（精确名称与子串关键字取并集去重）
- [x] 2.2 新建 `apps/douyin-sync/config/sync_rules.yaml`：对齐 Python 既有规则（`collections: ["AI存档", "心理学存档"]`，`name_keywords: ["存档"]`）
- [x] 2.3 `filter.ts` 实现 `loadSyncRulesConfig`：支持从 yaml 加载配置或缺省优雅降级
- [x] 2.4 `pipeline.ts` 中引入过滤引擎：当未传 `collectId` 时，基于规则过滤出目标收藏夹列表
- [x] 2.5 安全门禁：未指定目标夹且规则完全为空时拒绝全量无脑同步

## 3. CLI 选项扩展与死参数剔除

- [x] 3.1 `cli.ts` 的 `sync` 命令支持 `--keywords <kws...>` 和 `--folders <names...>`
- [x] 3.2 彻底删除 `cdpEndpoint` 参数（从 `cli.ts`、`pipeline.ts`、`public.ts`、`bridge.ts`、`types.ts`）
- [x] 3.3 物理删除孤立文件 `apps/douyin-sync/config/note_prompt.md`
- [x] 3.4 移除 `types.ts` 中的 `"render-data"` 死类型
- [x] 3.5 清理 `.gitignore` 中 Python ASR Sidecar 注释

## 4. 自动化测试验证

- [x] 4.1 新建 `tests/douyin-collect-filter.test.ts`：验证过滤引擎各种边界
- [x] 4.2 新增 `tests/douyin-pagination.test.ts`：验证全量分页拉取
- [x] 4.3 `pnpm typecheck` 0 错
- [x] 4.4 `pnpm test` 全绿 (162 passed)

## 5. 真实环境冒烟

- [x] 5.1 探针测试真实 26 个收藏夹全量拉取并被 `*存档*` 规则过滤（命中 9/26 个）
- [x] 5.2 验证「面试存档」作品完整拉取，突破 10 条限制（拉出 18 条，1 条为作者已删失效占位）

## 实测结论（2026-11-03）

| 验证项 | 修复前 | 修复后 | 结论 |
|---|---|---|---|
| 收藏夹总数拉取 | 截断在 10 个 | 完整拉出 26 个 | ✅ 突破限制 |
| 规则匹配与过滤 | 无脑全量同步（26个全拉） | 精准命中包含“存档”的 9 个夹子，排除吃吃/旅游等 17 个夹子 | ✅ 保护 Ghost 知识库 |
| 单夹作品翻页 | 截断在 10 件 | 「面试存档」拉满 18 件 | ✅ 突破限制 |
| 死代码与死参数 | cdpEndpoint/note_prompt.md/render-data 冗余 | 全部物理剔除/类型收窄 | ✅ 代码面极简 |
| 单元测试 | 155 passed | 162 passed (+7) | ✅ 全量通过 |

