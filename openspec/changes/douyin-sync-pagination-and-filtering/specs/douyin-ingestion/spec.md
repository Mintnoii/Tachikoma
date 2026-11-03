## ADDED Requirements

### Requirement: 收藏夹全量游标分页

系统 SHALL 通过服务端游标（cursor）循环拉取所有可用的收藏夹以及夹内作品，直至 `has_more` 为 false 或达到上限阈值，严禁因单次请求限制（count=10）而截断数据。

#### Scenario: 收藏夹列表分页拉取
- **WHEN** 用户的收藏夹总数大于单页限制（如超过 10 个）
- **THEN** 系统自动逐页翻页聚合，返回去重后的完整收藏夹列表

#### Scenario: 收藏夹内作品分页拉取
- **WHEN** 某个收藏夹内的作品总数大于单页限制（如超过 10 件）
- **THEN** 系统自动逐页翻页聚合，直至作品全部拉取完毕或达到配置的 `maxCount`

### Requirement: 收藏夹规则匹配与安全过滤门禁

系统 SHALL 支持通过精确名称列表（`collections`）与名称子串关键字列表（`name_keywords`）对收藏夹进行过滤，仅同步命中规则的收藏夹；在未指定单夹 ID 且未命中任何规则时，系统 SHALL 拒绝执行全量同步以避免污染知识库。

#### Scenario: 关键字子串匹配
- **WHEN** 配置了 `name_keywords: ["存档"]`
- **THEN** 名称中包含“存档”的收藏夹（如“AI存档”、“面试存档”）均被纳入同步目标，而不包含该子串的收藏夹（如“吃吃吃吃吃”）被排除

#### Scenario: 空规则安全拦截
- **WHEN** 未传入目标收藏夹 ID 且过滤规则列表为空
- **THEN** 系统抛出明确的安全异常或警告并退出，不执行全量拉取落盘

### Requirement: 移除无效的 CDP 连接参数

系统 SHALL 彻底移除全链路未使用的 `cdpEndpoint` 配置项与代码分支，统一依托持久化 Profile 进行无头浏览器会话交互。

#### Scenario: 启动 Bridge 或单条提取
- **WHEN** 调用 `openBrowserBridge` 或 `fetchPublicAwemeItem`
- **THEN** 接口参数签名中不再包含 `cdpEndpoint`，且内部不尝试 `connectOverCDP`
