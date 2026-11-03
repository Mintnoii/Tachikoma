# tasks: 抖音作者主页与合集专栏同步全量落地

## 1. 契约层与接口客户端扩展
- [x] 1.1 在 `apps/douyin-sync/src/types.ts` 中扩展 `SyncRulesConfig`、`DouyinAuthorRule`、`DouyinMixRule` 与相关配置契约；
- [x] 1.2 在 `apps/douyin-sync/src/client.ts` 中实现 `fetchMixAwemes`、`fetchAllMixAwemes`、`fetchAuthorAwemes`、`fetchAllAuthorAwemes` 全量分页客户端纯函数。

## 2. 流水线主循环与落盘路由
- [x] 2.1 在 `apps/douyin-sync/src/pipeline.ts` 中实现 `syncAuthors` 与 `syncMixes` 纯函数；
- [x] 2.2 扩展 `syncCollections`（或统一门面 `syncDouyinAll`），统一协调收藏夹、作者与合集的增量拉取、断点检查点（`target_type = "author" | "mix"`）保存；
- [x] 2.3 规范落盘子目录路由（`authors/<nickname>/` 与 `mixes/<mixName>/`）。

## 3. 配置文件迁移与 CLI 入口支持
- [x] 3.1 更新 `apps/douyin-sync/config/sync_rules.yaml`，填入原 Python 配置的作者（神经元出逃计划）；
- [x] 3.2 拓展 `apps/cli/src/cli.ts` 的 `sync` 子命令，支持 `--author` 与 `--mix` 专项触发。

## 4. 单元测试与端到端验证
- [x] 4.1 编写 `tests/douyin-author-and-mix.test.ts` 覆盖作者与合集的分页聚合、增量对账与目录路由；
- [x] 4.2 运行全仓 `pnpm test` 与 `pnpm build`，确保 100% 绿灯通过；
- [x] 4.3 勾选并结案 tasks。
