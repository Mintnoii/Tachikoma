## ADDED Requirements

### Requirement: 匿名解析失败必须可诊断

抖音单条作品匿名解析 SHALL 在任一提取路径失败时抛出携带失败分类的错误，禁止以 `TypeError` 或空值穿透形式静默失败。

#### Scenario: SSR 数据缺失且接口无响应
- **WHEN** 页面 `_ROUTER_DATA` 中不存在 `videoInfoRes`，且页内 XHR 返回空
- **THEN** 抛出 `DouyinExtractionError`，`reason` 为 `ssr-no-item` 或 `bridge-empty`，并附带已尝试的路径列表

#### Scenario: 桥接返回值缺失
- **WHEN** `page.evaluate` 返回 `undefined`
- **THEN** `requestJson` 抛出 `bridge-empty` 并包含请求 path，不得读取 `undefined.ok`

### Requirement: 多路径深度发现作品数据

解析器 SHALL 对页面注入变量做递归深度搜索，并支持页面内同源接口请求，不得假定作品数据固定在某一层 JSON 路径。

#### Scenario: 数据层级变动
- **WHEN** 抖音把作品数据从 `loaderData.videoInfoRes` 移到其他嵌套层级
- **THEN** 递归搜索仍能在任意深度命中 `item_list[0]` 或 `aweme_detail`

#### Scenario: 直连接口 403 但页内同源可通
- **WHEN** Node 侧直连 `aweme/detail` 返回 403
- **THEN** 经由页面上下文发起的同源请求仍可取得数据

### Requirement: 兜底解析必须标记置信度

当作品数据仅由 DOM/`og:*` 兜底提取时，解析结果 SHALL 标记为 `dom-fallback` 置信度，CLI 回执 SHALL 提示正文可能不完整。

#### Scenario: 所有权威路径落空
- **WHEN** SSR、RENDER_DATA 与页内 XHR 均未命中，仅 DOM 有标题
- **THEN** 返回 `confidence = "dom-fallback"`，CLI 标注建议后续 `spark distill` 补齐
