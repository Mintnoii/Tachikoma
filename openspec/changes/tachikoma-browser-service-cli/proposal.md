# Proposal: 抽取 Tachikoma 统一浏览器能力为通用 CLI 服务 (tachikoma-browser-service-cli)

## 1. 核心背景与矛盾
- 全机跨项目（如 Ghost 成果物渲染、发布、以及外部页面抓取）目前存在零散手搓 Playwright 的历史包袱，导致每个项目都需要承担重型依赖与选择器维护成本；
- `Tachikoma` 已经通过 `@tachikoma/core` 的 `withBrowserPage` 构建了完善的反爬、CDP 挂载、指纹伪装与生命周期管控；
- 为了实现“全机零侵入、跨进程直接复用、避免项目重复安装 Playwright”，需要将 Tachikoma 的浏览器自动化能力升格为全机通用 CLI 服务。

## 2. 演进范围与设计规格
在 `apps/cli/src/browser-cli.ts` 注册并实现 `tachikoma browser` 子命令族：
1. **`tachikoma browser eval --url <url> --script <js_file_or_code> [--json] [--headless]`**：
   - 导航到目标 URL，执行自定义页面抽取脚本并返回标准 JSON 输出；
2. **`tachikoma browser screenshot --url <url> --out <file> [--full-page]`**：
   - 通用网页截图落盘；
3. **`tachikoma browser cdp-status`**：
   - 探测本地 Chrome CDP (9222) 连通性与活跃 Target。

## 3. 跨工程调用体验
下游工程（如 Ghost）完全不需要安装 `playwright`，只需直接调用命令：
```bash
tachikoma browser eval --url "https://..." --script "..." --json
```
