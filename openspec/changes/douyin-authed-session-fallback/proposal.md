# 变更提案：抖音登录态通道迁移与匿名失败自动兜底

> **Proposal ID**: `douyin-authed-session-fallback`
> **提出时间**: 2026-11-02
> **素材源流**: 当前对话直接提炼（含 2026-11-02 实测证据，推翻初版「需重新扫码」的假设）

## 动机

抖音单条匿名解析已实测全线失效：三条不同作品（`5BKzcil9tiQ` / `elQVkRRk3I8` / `tP-JsTapVuU`）分享页均返回空壳，`videoInfoRes` / `item_list` / `RENDER_DATA` / `__INITIAL_STATE__` 全部缺失；接口直连返回 `403 Blocked by ArgusSecurityPlugin Uifid Not Found`。收藏夹路径同样不可用：匿名上下文打开 `douyin.com/user/self?showTab=favorite_collection` 落在「验证码中间页」。

**关键实测结论：登录态并没有丢。** 旧 Python 项目 `C:/Users/wangqing/Desktop/douyin-sync/.pw-profile` 是 Playwright 持久化 profile，实测：

- 打开收藏夹页落地 URL 正常，非验证码页；
- Cookie 47 条，`sessionid` / `sessionid_ss` / `sid_tt` 齐全；
- 页面读到真实账号（昵称、抖音号、地区、作品数）。

TS 重构后 `apps/douyin-sync/src/bridge.ts` 已内建 `profileDir` → `chromium.launchPersistentContext` 能力，但 **CLI 从未接线，profile 也从未迁移**。`config/cookies.json` 是空壳（0 条 cookie、`.gitignore` 忽略、历史从未提交），不是登录态真源。

因此**不需要重新扫码**，只需把旧 profile 迁移进新工作区并接线。

## 变更内容

1. **profile 迁移**：将旧 `.pw-profile` 复制为 `<workspace>/.secrets/douyin-profile`（原目录保留不动作回滚），`.secrets/` 加入 `.gitignore`。
2. **登录态探活**：新增 `tachikoma douyin status`，无头探活输出 `authed` / `anonymous`。
3. **登录命令**：新增 `tachikoma douyin login`，仅在登录态过期时使用，有界面启动同一 profile 供人类扫码。
4. **接线**：`ingest`（单条）与 `sync`（收藏夹）均把 `profileDir` 传给 bridge。
5. **自动兜底**：`ingest` 单条抖音时先走匿名多路径提取；若抛出 `DouyinExtractionError`，且本机 profile 处于已登录态，则自动用该 profile 重试一次，成功后卡片标注 `fetchConfidence: "authed-session"`；未登录时回执提示可执行 `douyin login`。
6. **清理误导**：`config/cookies.json` 若确认为空壳则删除，避免后续误以为存在登录态。

## 实现方案

- `apps/douyin-sync/src/session.ts`（新增）：`resolveDouyinProfileDir()`（`<workspace>/.secrets/douyin-profile`）、`hasDouyinSession(userDataDir)`（持久化上下文 + cookie 名判定）、`loginInteractively(userDataDir)`（有头启动 + 轮询登录态）。
- `apps/cli/src/cli.ts`：新增 `douyin status` / `douyin login` 子命令；`sync` 与 `ingest` 的抖音分支补 `profileDir`。
- `apps/douyin-sync/src/public.ts`：`fetchPublicAwemeItem` 接受 `session` 选项，匿名失败且已登录时以持久化上下文重跑，`source` 记 `authed-session`。
- `packages/core/src/browser.ts`：复用既有持久化上下文能力，仅补齐缺失分支。
- `.gitignore`：新增 `.secrets/`。

## 涉及 Spec 模块

- `douyin-ingestion` — 新增「登录态通道」「匿名失败自动兜底」「收藏夹必须携带登录态」三条约束

## 新增 / 修改 Requirement

### ADDED Requirements

#### Requirement: 登录态存放于专用隔离 profile

系统 SHALL 将抖音登录态持久化在 `<workspace>/.secrets/douyin-profile`，不得读写用户日常浏览器 profile，该目录 MUST 被 `.gitignore` 忽略。

##### Scenario: 首次迁移
- **WHEN** 首次运行抖音相关命令且 `.secrets/douyin-profile` 不存在
- **THEN** 系统提示可从未迁移的旧 profile 复制，或执行 `tachikoma douyin login` 建立登录态

##### Scenario: 查询登录态
- **WHEN** 执行 `tachikoma douyin status`
- **THEN** 输出 `authed` 或 `anonymous`，且不弹出有界面窗口

#### Requirement: 匿名失败应按登录态自动兜底

单条抖音摄入 SHALL 在匿名多路径提取全部失败后，若专用 profile 处于已登录态，则自动以该 session 重试一次；兜底成功的结果 MUST 标注 `fetchConfidence: "authed-session"`。

##### Scenario: 匿名失败但已登录
- **WHEN** 匿名提取抛 `dom-fallback-empty` 且 profile 为 `authed`
- **THEN** 使用登录态重试并成功入库，回执标注数据来自登录态会话

##### Scenario: 匿名失败且未登录
- **WHEN** 匿名提取失败且 `status = anonymous`
- **THEN** 输出结构化失败原因与「未检测到登录态，可执行 tachikoma douyin login」提示，且不在 `sparks.db` 留脏记录

#### Requirement: 收藏夹同步必须携带登录态

`sync` 命令 SHALL 使用专用 profile 启动浏览器上下文，禁止以匿名上下文访问收藏夹接口。

##### Scenario: 未登录时执行同步
- **WHEN** `status = anonymous` 且执行 `tachikoma sync`
- **THEN** 直接报错并提示先建立登录态，不进入逐个作品的抓取循环

## 非目标

- 不实现自动扫码或破解验证码
- 不逆向 `a_bogus` / `UIFID` 签名算法
- 不支持多账号切换
- 不改动 `packages/core` 的公共契约（除必要的持久化上下文分支）

## 向后兼容性

向后兼容。新增子命令与可选参数；无 profile 时单条摄入行为与当前一致（结构化失败），`sync` 则从「静默失败」变为「明确报错」。

## 涉及文件

- `apps/douyin-sync/src/session.ts` — 新增：profile 路径、探活、交互登录
- `apps/douyin-sync/src/public.ts` — 登录态兜底提取
- `apps/cli/src/cli.ts` — `douyin status` / `douyin login`、`sync` 与 `ingest` 接线
- `packages/core/src/browser.ts` — 持久化上下文分支（如缺）
- `.gitignore` — 忽略 `.secrets/`
- `apps/douyin-sync/config/cookies.json` — 空壳文件清理
