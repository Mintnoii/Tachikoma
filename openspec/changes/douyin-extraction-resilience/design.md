# Design: 抖音匿名解析链路抗改版加固

## Context

2026-11-02 实测：`https://v.douyin.com/5BKzcil9tiQ/` → `https://www.iesdouyin.com/share/video/7703453146412010779/`。

- 分享页 HTTP 200、32KB，但 `_ROUTER_DATA.loaderData` 的 key 只有 `video_layout` 与 `video_(id)/page`，后者字段为 `ua/isSpider/webId/query/renderInSSR/itemId/serverToken/abParams` 等，**无 `videoInfoRes`**；
- `web/api/v2/aweme/iteminfo/?item_ids=<id>` → 200 空 body；
- `www.douyin.com/aweme/v1/web/aweme/detail/` 直连 → 403（缺签名/客户端头）。

现有代码假设 `loaderData[任意key].videoInfoRes.item_list[0]` 存在（`public.ts` 的 `findCandidate` 只扫一层 `Object.values`），假设失效后回退到 `BrowserBridge.requestJson`，而该函数对 `page.evaluate` 的返回值无收窄，`undefined.ok` 直接抛 TypeError。

## Goals / Non-Goals

**Goals**
- 让失败可诊断：抛分类错误，而不是 TypeError
- 让提取不依赖固定 JSON 层级：递归深度搜索 + RENDER_DATA 解码 + 页内同源 XHR
- 命中兜底路径时标记可信度，避免把 DOM 猜测当权威数据

**Non-Goals**
- 不引入登录态/扫码登录
- 不改 Sparks schema、不动 OCR/ASR 管线

## Decisions

### D1. 递归深度搜索，替代固定层级取值

- 方案：新增纯函数 `deepFindAwemeItem(value)`，深度优先遍历，命中判定为对象含 `item_list`（数组且首元素为对象）或含 `aweme_detail` 或含 `aweme_id` + `video`/`images`。
- 备选：为每个已知层级写显式路径。
- 理由：抖音每次改版只挪层级不换字段名，递归搜索的抗变能力远高于维护路径表；备选方案改一次版就要加一条路径，维护成本随版本线性上升。

### D2. 页内同源 XHR 优先于 Node 直连

- 方案：数据缺失时，用 `page.evaluate` 在页面上下文 `fetch("/aweme/v1/web/aweme/detail/?aweme_id=...")`，带上页面 UA 与 Cookie。
- 备选：Node 侧 `fetch` + 伪造签名。
- 理由：签名算法随版本变化且需要逆向，页内请求天然具备同源上下文与设备指纹，成本低且稳定；伪造签名属于持续对抗，投入产出比差。

### D3. 失败分类而非抛原始异常

- 方案：定义 `DouyinExtractionError`，`reason` 取值 `ssr-no-item` / `bridge-empty` / `api-forbidden` / `dom-fallback-empty`，携带 `attempts: string[]`。
- 理由：本次事故的核心损失不是「抓不到」，而是「看不出为什么抓不到」，排查花了多轮 curl 才定位到 SSR 被抽空。分类错误把诊断成本从分钟级压到秒级。

### D4. 兜底命中降级置信度

- 方案：DOM/`og:*` 命中时给结果打 `fetchConfidence: "dom-fallback"`，CLI 回执显式标注「标题来自页面摘要，正文可能不完整」。
- 理由：DOM 兜底会产出看似正常但内容残缺的卡片，静默入库会污染 Sparks。

## Risks / Trade-offs

- 递归深度搜索对超大对象有性能开销 → 限制最大深度（建议 8 层）与已访问节点集合防环。
- 页内 XHR 依赖页面尚存 Cookie 与反爬放行 → 仍可能失败，但失败会落到 `api-forbidden`，不再掩盖。
- DOM 兜底降级后可能入库「只有标题」的种子卡 → 由 CLI 明确告知，用户可决定是否 `spark distill` 补齐。

## Migration Plan

无数据迁移。纯代码变更，回滚即 revert。

## Open Questions

- 收藏夹批量 `sync` 是否也应在 `BrowserBridge.requestJson` 失败时降级到 DOM 提取？（本次先只加固单条路径，批量路径观察后再定）
