# Tasks: 消除跨仓隐式依赖与 CLI 构建打包体系闭环

- [x] Task 1: 将 `@dotagents/utils` 工具函数内生化至 `@tachikoma/core`
  - [x] 在 `packages/core/src/utils/` 创建 `path.ts`, `hash.ts`, `markdown.ts`
  - [x] 在 `packages/core/src/index.ts` 中导出工具模块
  - [x] 批量替换 `apps/douyin-sync/src/`、`packages/core/src/formatter.ts` 和 `tests/*.test.ts` 中的外部引用
  - [x] 从 `tsconfig.json` 中移除 `@dotagents/utils` 的 paths 映射
  - [x] 验证 `pnpm typecheck` 保证跨仓依赖彻底切断后依然 0 报错

- [x] Task 2: 配置 `apps/cli` 的 `tsup` 打包构建管线
  - [x] 在 `apps/cli/package.json` 添加 `tsup` 依赖并配置构建脚本 `"build": "tsup"`（配合 `tsup.config.ts` 输出带 Shebang 的 ESM 单文件产物）
  - [x] 在根目录 `package.json` 添加统一 `"build"` 命令
  - [x] 执行 `pnpm build` 并验证 `apps/cli/dist/cli.js` 产物正常生成与执行

- [x] Task 3: 回归测试与验收
  - [x] 运行全量 `pnpm test`（114 项单测确保 100% 通过）
  - [x] 运行 `node apps/cli/dist/cli.js --help` 验证打包产物可用
