# 变更提案：抖音匿名解析链路抗改版加固与失败可诊断

> **Proposal ID**: `douyin-extraction-resilience`
> **提出时间**: 2026-11-02
> **素材源流**: 当前对话直接提炼（微信单条抖音链接摄入失败现场排查）

## 动机

微信收到单条抖音链接 `https://v.douyin.com/5BKzcil9tiQ/` 时，`tachikoma ingest` 在 90 秒后失败，输出 `Cannot read properties of undefined (reading 'ok')`。

排查实证：

1. 短链重定向正常 → `https://www.iesdouyin.com/share/video/7703453146412010779/`，HTTP 200、32KB；
2. 但页面 `_ROUTER_DATA.loaderData` 内**只有 ua / appName / serverToken / abParams 等上下文，不含 `videoInfoRes.item_list`** —— 抖音已把匿名 SSR 的作品数据抽走；
3. 旧公开接口 `web/api/v2/aweme/iteminfo` 返回 HTTP 200 但 body 为空；`douyin.com/aweme/v1/web/aweme/detail` 无签名直连 403；
4. `apps/douyin-sync/src/public.ts` 的三层回退（网络拦截 → `_ROUTER_DATA` → DOM 启发式）全部落空，转入 `BrowserBridge.requestJson`；
5. `apps/douyin-sync/src/bridge.ts:147` 写的是 `if (!payload.ok)`，而 `page.evaluate` 在拿不到数据时返回 `undefined`，于是抛出 TypeError，**把真实病因（抖音改版）掩盖成代码崩溃**，且失败后不留任何可诊断信息。

后果：单条抖音链接摄入全线不可用，且收藏夹批量同步（同源 `BrowserBridge`）存在同样风险。

## 变更内容

1. **失败可诊断**：桥接层与解析层不再抛裸 TypeError，改为抛出带失败原因分类的 `DouyinExtractionError`（`ssr-no-item` / `bridge-empty` / `api-forbidden` / `dom-fallback-empty`）。
2. **解析路径加固**：在 `public.ts` 增加与平台改版无关的数据发现策略——
   - 对 `_ROUTER_DATA` / `__INITIAL_STATE__` / `__INIT_PROPS__` 做**递归深度搜索**，不再假定固定层级；
   - 解码 `<script id="RENDER_DATA">` 的 URI-encoded JSON；
   - 页内同源请求 `aweme/v1/web/aweme/detail/`（带页面 Cookie 与 UA，由页面上下文发起，规避直连 403）；
   - DOM/`og:*` 兜底保持为最后一层，并在命中兜底时把 `fetch_confidence` 降级。
3. **不失败即静默**：所有路径均落空时，CLI 输出可读的失败清单（试过哪些路径、各自返回什么状态），而不是超时后无输出。
4. **非交互执行约定**：CLI 在无 TTY 的管道/后台场景下必须给出确定性行为（要么正常跑完，要么立刻以明确错误退出），不得静默半写入。

## 实现方案

- `apps/douyin-sync/src/public.ts`：抽出 `deepFindAwemeItem(value: unknown)` 纯函数做递归搜索；新增 `extractFromPageContext(page)` 在页面内串行尝试 SSR 变量 → RENDER_DATA → 页内 XHR → DOM；每层返回 `{ source, data }` 以便统计命中路径。
- `apps/douyin-sync/src/bridge.ts`：`requestJson` 对 `page.evaluate` 返回值做显式收窄，`undefined` 或非对象时抛出 `DouyinExtractionError("bridge-empty", ...)`，携带 path 与 params。
- `apps/cli/src/cli.ts`：`ingestDouyinToSparks` 捕获 `DouyinExtractionError` 时输出结构化失败回执（不吞异常、不打印 TypeError）。
- 不改动 `packages/core` 公共契约；不改动 Sparks 表结构。

## 涉及 Spec 模块

- `douyin-ingestion` — 新增「匿名解析失败必须可诊断」与「多路径深度发现」两条约束

## 新增 / 修改 Requirement

### ADDED Requirements

#### Requirement: 匿名解析失败必须可诊断

抖音单条作品匿名解析 SHALL 在任一提取路径失败时抛出携带失败分类的错误，禁止以 `TypeError` 或空值穿透形式静默失败。

##### Scenario: SSR 数据缺失且接口无响应
- **WHEN** 页面 `_ROUTER_DATA` 中不存在 `videoInfoRes`，且页内 XHR 返回空
- **THEN** 抛出 `DouyinExtractionError`，`reason` 为 `ssr-no-item` 或 `bridge-empty`，并附带已尝试的路径列表

##### Scenario: 桥接返回值缺失
- **WHEN** `page.evaluate` 返回 `undefined`
- **THEN** `requestJson` 抛出 `bridge-empty` 并包含请求 path，不得读取 `undefined.ok`

#### Requirement: 多路径深度发现作品数据

解析器 SHALL 对页面注入变量做递归深度搜索，并支持页面内同源接口请求，不得假定作品数据固定在某一层 JSON 路径。

##### Scenario: 数据层级变动
- **WHEN** 抖音把作品数据从 `loaderData.videoInfoRes` 移到其他嵌套层级
- **THEN** 递归搜索仍能在任意深度命中 `item_list[0]` 或 `aweme_detail`

##### Scenario: 直连接口 403 但页内同源可通
- **WHEN** Node 侧直连 `aweme/detail` 返回 403
- **THEN** 经由页面上下文发起的同源请求仍可取得数据

### MODIFIED Requirements

> 无

## 非目标

- 不接入用户个人账号登录态（匿名优先策略不变，登录态仍只用于收藏夹批量对账）
- 不改动 Sparks 数据模型与 MOC 分类体系
- 不做抖音评论/带货等扩展字段抓取
- 不修复本次排查中发现的非本仓问题（Hermes 终端包装层的 tty 行为）

## 向后兼容性

向后兼容。新增错误类型为内部类型；CLI 正常路径输出格式不变，仅失败路径从 TypeError 变为结构化失败回执。

## 涉及文件

- `apps/douyin-sync/src/public.ts` — 递归深度发现 + 多路径提取 + 命中来源标记
- `apps/douyin-sync/src/bridge.ts` — `requestJson` 空值收窄与分类错误
- `apps/cli/src/cli.ts` — 失败回执结构化输出
- `tests/douyin-public-ocr.test.ts` — 补空值路径与深层级命中用例
