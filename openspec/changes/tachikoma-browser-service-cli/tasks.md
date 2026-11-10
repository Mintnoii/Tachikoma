# Tasks: 抽取 Tachikoma 统一浏览器能力为通用 CLI 服务

- [x] 1. 在 `apps/cli/src/browser-cli.ts` 实现 `registerBrowserCommands(program: Command)`
  - [x] 1.1 实现 `tachikoma browser eval` 命令（支持 `--url`, `--script`, `--selector`, `--json`, `--headless`）
  - [x] 1.2 实现 `tachikoma browser screenshot` 命令（支持 `--url`, `--out`, `--full-page`）
  - [x] 1.3 实现 `tachikoma browser cdp-status` 状态探测命令
- [x] 2. 在 `apps/cli/src/cli.ts` 注册 `registerBrowserCommands(program)`
- [x] 3. 编译打包并在集成环境下验证 `eval` / `selector` / `cdp-status` 全部通过
- [x] 4. 全量运行 `pnpm test` (170/170 绿灯通过)

