# Tasks: 抖音登录态通道迁移与匿名失败自动兜底

## 0. profile 迁移（零重新登录）

- [x] 0.1 确认无进程占用 `Desktop/douyin-sync/.pw-profile`，整目录复制到 `<workspace>/.secrets/douyin-profile`
- [x] 0.2 复制后用持久化上下文探活，确认落地收藏夹页非验证码页、`sessionid` 存在
- [x] 0.3 `.gitignore` 增加 `.secrets/`
- [x] 0.4 删除空壳 `apps/douyin-sync/config/cookies.json`（0 条 cookie，历史从未提交）

## 1. 持久化浏览器上下文

- [x] 1.1 `packages/core/src/browser.ts` 提供 `withPersistentBrowserContext(userDataDir, options, fn)`：`chromium.launchPersistentContext`，支持 `headless` 开关，资源确定性回收（若已有等价能力则复用，不重复造）
- [x] 1.2 从 `packages/core/src/index.ts` 导出

## 2. 登录态会话模块

- [x] 2.1 新增 `apps/douyin-sync/src/session.ts`：`resolveDouyinProfileDir()` → `<workspace>/.secrets/douyin-profile`（不存在则按需创建）
- [x] 2.2 `hasDouyinSession(userDataDir)`：无头启动持久化上下文，按 cookie（`sessionid` / `sessionid_ss` / `sid_tt`）判定 `authed | anonymous`
- [x] 2.3 `loginInteractively(userDataDir, options)`：有头启动，轮询登录态，成功后关闭并返回 `authed`

## 3. 提取层兜底

- [x] 3.1 `public.ts` 的 `fetchPublicAwemeItem` 增加可选 `session: { userDataDir }` 参数
- [x] 3.2 匿名全败且 `session` 有效时，用持久化上下文按同一套多路径提取重跑一次，`source` 记为 `authed-session`、`confidence` 记为 `authed-session`
- [x] 3.3 无 `session` 或登录态无效时，沿用既有 `DouyinExtractionError`（含 `attempts`），不新增静默降级

## 4. CLI 子命令与回执

- [x] 4.1 新增 `tachikoma douyin login`：调 `loginInteractively`，输出登录结果与 profile 路径
- [x] 4.2 新增 `tachikoma douyin status`：输出 `authed` / `anonymous`，不弹窗口
- [x] 4.3 `ingest` 单条抖音路径接入兜底：匿名失败 → 检测登录态 → 已登录则重试一次 → 成功回执标注「数据来自登录态会话」
- [x] 4.4 未登录时失败回执追加提示「可执行 `tachikoma douyin login` 建立登录态」
- [x] 4.5 `sync` 把 `profileDir` 传给 bridge，并在未登录时前置报错退出（不进抓取循环）

## 5. 测试与验证

- [x] 5.1 单测：`resolveDouyinProfileDir` 锚定 workspace 且创建目录
- [x] 5.2 单测：`hasDouyinSession` 在注入的 cookie 集合下分别判定 `authed` / `anonymous`（用可注入的探测函数，不真起浏览器）
- [x] 5.3 单测：匿名失败 + 登录态有效时走兜底分支（注入假提取器验证调用次数与 `fetchConfidence`）
- [x] 5.4 `pnpm typecheck` + `pnpm test` 全绿
- [x] 5.5 真实链路：`douyin status` 输出 `authed`；用 `v.douyin.com/5BKzcil9tiQ` 冒烟验证单条摄入能取到正文
- [ ] 5.6 真实链路：`sync --collect-id <id>` 小样本验证收藏夹能落盘且 `sync.db` 有账本记录（尚未跑，待选样本）

## 实测结果（2026-11-02）

**profile 迁移**：`Desktop/douyin-sync/.pw-profile` → `.secrets/douyin-profile`，剪掉 Cache 目录后 4.6MB；探活确认 47 条 cookie、`sessionid` 齐全、收藏夹页渲染真实账号。

**`douyin status`**：输出 `authed`。

**单条摄入**（`v.douyin.com/5BKzcil9tiQ`）：
```
[Tachikoma] 匿名解析未命中，检测到本机有效登录态，自动兜底重试...
⚡ [Tachikoma] 单条抖音灵感已收录
  标题:   AI 抓网页，浏览器成了瓶颈 GitHub 宝藏项目！
  作者:   Jackey｜AI Agent实战
  媒介:   视频
  来源:   authed-session
[Tachikoma ASR] 语音转录跳过/降级: 下载音视频源失败: HTTP 403
```

结论：登录态兜底生效，元数据与正文描述完整取回；**但视频音视频源仍 403，ASR 转录拿不到**，目前内容为简介/要点级，非语音全文。若要音频转录，需要新的变更（音视频源同样受 Argus 保护）。

## 6. 文档对齐

- [x] 6.1 `AGENTS.md` 增补登录态通道与兜底规则的说明
- [x] 6.2 README 或 CLI `--help` 中体现 `douyin login` / `douyin status`
