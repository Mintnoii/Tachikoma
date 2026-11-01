# Proposal: Tachikoma 深度体检缺陷修复与健壮性加固

## 背景与问题诊断
在通过 Orca 编排 Claude 对 Tachikoma 全仓进行全盘业务逻辑与健壮性体检中，发现以下关键缺陷：
1. **P0 墓碑账本双重失效（过滤穿透）**：
   - `packages/core/src/tombstone.ts` 的 `loadGhostTombstones(ghostVaultRoot)` 硬编码寻找 `${ghostVaultRoot}/.cache/ignored.json`。但调用方传入的是 `Ghost/_raw`，导致拼接出 `Ghost/_raw/.cache/ignored.json`，实际物理文件位于 `Ghost/.cache/ignored.json`，检测恒为 false；
   - `apps/douyin-sync/src/pipeline.ts` 中 `filterUnsynced(db, items)` 漏传 `ghostVaultRoot`，导致抖音收藏夹同步完全绕过墓碑拦截。
2. **P1 Playwright 进程泄露**：
   - `apps/web-clipper/src/fetcher.ts`、`apps/douyin-sync/src/bridge.ts` 与 `public.ts` 中，`chromium.launch()` 后仅关闭了 Context/Page，未关闭 `Browser` 对象本身，常驻或批处理时会导致后台残留大量孤儿 Chrome 进程。
3. **P1 SQLite 并发死锁风险**：
   - `apps/douyin-sync/src/reconciliation.ts` 与 `packages/core/src/sparks/db.ts` 初始化 `DatabaseSync` 时缺少 `PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`，在 Windows 并发或异步读写下容易发生 `database is locked`。
4. **P1 LLM 输出容错自愈缺失**：
   - `packages/core/src/sparks/distill.ts` 直接使用裸 `JSON.parse` 处理大模型输出，未采用全机审美约定的 `jsonrepair` 进行防御自愈。

## 目标
1. 智能解析 Ghost 根目录：当传入路径包含 `_raw` 时自动定位至真实 Ghost Vault 根目录，彻底修复墓碑账本加载与过滤；
2. 在 `syncCollections` 完整传递 `outputDir` 给 `filterUnsynced`；
3. 为所有 Playwright 抓取函数完善 `Browser` 实例生命周期回收，杜绝僵尸进程；
4. 为 SQLite 数据库连接注入 WAL 模式与 5000ms 忙等待；
5. 在 `packages/core` 引入 `jsonrepair`，提升 LLM 提纯容错能力；
6. 保持 100% 单测绿色通过。
