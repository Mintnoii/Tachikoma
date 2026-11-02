## ADDED Requirements

### Requirement: 登录态存放于专用隔离 profile

系统 SHALL 将抖音登录态持久化在 `<workspace>/.secrets/douyin-profile`，不得读写用户日常浏览器 profile，该目录 MUST 被 `.gitignore` 忽略。

#### Scenario: 首次迁移
- **WHEN** 首次运行抖音相关命令且 `.secrets/douyin-profile` 不存在
- **THEN** 系统提示可从未迁移的旧 profile 复制，或执行 `tachikoma douyin login` 建立登录态

#### Scenario: 查询登录态
- **WHEN** 执行 `tachikoma douyin status`
- **THEN** 输出 `authed` 或 `anonymous`，且不弹出有界面窗口

### Requirement: 匿名失败应按登录态自动兜底

单条抖音摄入 SHALL 在匿名多路径提取全部失败后，若专用 profile 为已登录态，则以该 session 重试一次；兜底成功 MUST 标注 `fetchConfidence: "authed-session"`。

#### Scenario: 匿名失败但已登录
- **WHEN** 匿名提取抛 `DouyinExtractionError` 且 `status = authed`
- **THEN** 以登录态重试并成功入库，回执标注数据来自登录态会话

#### Scenario: 匿名失败且未登录
- **WHEN** 匿名提取失败且 `status = anonymous`
- **THEN** 输出结构化失败原因与「未检测到登录态，可执行 tachikoma douyin login」提示，且不在 `sparks.db` 留脏记录

### Requirement: 收藏夹同步必须携带登录态

`sync` 命令 SHALL 使用专用 profile 启动浏览器上下文，禁止以匿名上下文访问收藏夹接口。

#### Scenario: 未登录时执行同步
- **WHEN** `status = anonymous` 且执行 `tachikoma sync`
- **THEN** 直接报错并提示先建立登录态，不进入逐个作品的抓取循环

#### Scenario: 已登录时执行同步
- **WHEN** `status = authed` 且执行 `tachikoma sync`
- **THEN** 以持久化 profile 启动上下文，成功拉取收藏夹并按既有对账账本增量落盘
