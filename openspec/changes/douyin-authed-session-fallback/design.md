# Design: 抖音登录态通道迁移与匿名失败自动兜底

## Context

匿名链路的终局已实测确认：`ssr:_ROUTER_DATA / __INITIAL_STATE__ / __INIT_PROPS__ / render-data / in-page-xhr / dom-fallback` 六条路径全空，结论 `dom-fallback-empty`；接口直连 403 `ArgusSecurityPlugin Uifid Not Found`。继续在匿名侧加码属于对抗平台风控，投入产出比极差。

**登录态仍然存在**：旧 Python 项目 `Desktop/douyin-sync/.pw-profile`（Playwright 持久化 profile）实测 47 条 cookie、`sessionid` 齐全、收藏夹页正常渲染真实账号。TS 重构时没有迁移它，CLI 也没接线，才表现为「两条路径全断」。

因此本变更的实质是**迁移 + 接线**，而非新建登录体系。


## Goals / Non-Goals

**Goals**
- 把旧 `.pw-profile` 迁移到 `<workspace>/.secrets/douyin-profile`，零重新登录
- 匿名失败时自动兜底，成功即入库并标注来源置信度
- 收藏夹 `sync` 必须带登录态，未登录时明确报错而非静默失败
- 登录态永不进版本库

**Non-Goals**
- 不自动登录、不解验证码
- 不逆向签名算法
- 不做多账号管理

## Decisions

### D1. 迁移旧 profile，而非重新登录

- 方案：把 `Desktop/douyin-sync/.pw-profile` 复制到 `<workspace>/.secrets/douyin-profile`，原目录保留作回滚。
- 备选：直接在旧目录上跑（`profileDir` 指过去）。
- 理由：旧目录属于已废弃的 Python 项目，随时可能被清理；且跨项目共用同一 profile 会被多个进程抢锁。复制一份独立持有，职责边界清晰。

### D2. 登录命令有界面、抓取无界面

- 方案：`douyin login` 用 `headless: false` 供人类操作；抓取复用同一 `userDataDir` 但 `headless: true`。
- 理由：登录必须人机协作；抓取必须不抢焦点（符合本仓「后台静默」风格）。

### D3. 登录态判定按 cookie 存在性，而非页面文案

- 方案：持久化上下文打开 `www.douyin.com`，检查 cookie 中是否存在会话 cookie（`sessionid` / `sessionid_ss` / `sid_tt` 任一）。
- 备选：抓页面「登录」按钮是否消失。
- 理由：DOM 文案随改版变化，cookie 名相对稳定；且判定不需要渲染整页，快。

### D4. 兜底只在匿名全败后触发一次

- 方案：`fetchPublicAwemeItem` 匿名链路抛 `DouyinExtractionError` 后，若 `status = authed`，用持久化上下文重跑一次提取；结果标 `fetchConfidence: "authed-session"`。
- 理由：登录态抓取更慢且要落磁盘 profile，不应作为默认路径；只在必要时刻触发，且限一次，避免失败重试风暴。

### D5. 收藏夹同步前置校验登录态

- 方案：`sync` 启动前先 `hasDouyinSession`，未登录直接报错退出。
- 备选：照常跑，逐个作品失败再说。
- 理由：匿名访问收藏夹只会拿回验证码页，逐个失败既慢又留下大量噪声日志；前置拦截一次说清楚。

## Risks / Trade-offs

- 登录态会过期 → `douyin status` 明确报告，失败时回执提示重新 `login`。
- 迁移后 profile 占磁盘（数百 MB 级）→ 目录固定一处，可随时删除重建。
- 抖音可能对无头登录态降级 → 若登录态下仍取不到，回执会落到 `dom-fallback-empty`，仍可诊断。
- 旧 profile 若被其它进程占用，复制会不完整 → 复制前检查有无 Chrome 进程占用，必要时先关闭。

## Migration Plan

一次性迁移：复制旧 profile → 校验 `douyin status` 为 `authed` → 保留旧目录一个月后再清理。`.secrets/` 加入 `.gitignore`。

## Open Questions

- 是否需要把登录态兜底同样接到 `spark distill`（对已入库的种子卡补正文）？本次先不做。
