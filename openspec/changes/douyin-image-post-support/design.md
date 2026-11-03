# 设计：请求上下文决定图文是否放行

## 1. 根因

抖音的 `/aweme/v1/web/aweme/detail/` 对图文作品做了上下文校验：请求的 `Referer` 必须是该图文作品页本身，否则返回

```json
{"aweme_detail": null,
 "filter_detail": {"aweme_id": "...", "filter_reason": "images_base", "detail_msg": "", "notice": ""}}
```

`images_base` = 图文（images）基础过滤器拦截，**不是作品不存在**（同一 id 的作品页 title 正常、页面能渲染出图片）。

## 2. 当前实现为什么踩坑

`public.ts` 在只拿到 aweme id 时构造 `https://www.iesdouyin.com/share/video/{id}` 作为落地页，然后在 page 上下文里 XHR。该上下文不是作品页，图文一律被过滤 → 所有路径都空 → 最终 `bridge-empty`。

## 3. 方案

### D1 落地页按作品类型选择

- URL 明确含 `/note/` → 落地 `https://www.douyin.com/note/{id}`
- URL 明确含 `/video/` → 落地 `https://www.douyin.com/video/{id}`
- 只有 id（不确定类型）→ 先 `www.douyin.com/video/{id}`；若 detail 返回 `aweme_detail: null` 且 `filter_reason === "images_base"`，再以 `www.douyin.com/note/{id}` 重试一次

不用 iesdouyin 分享页作为默认落地页：分享页 SSR 已不含 `videoInfoRes`（视频也一样），只有 `layout` 与 `page` 参数。

### D2 失败原因可判读

`errors.ts` 的 `ExtractionFailureReason` 增加 `images-filtered`：

- in-page XHR 返回 `filter_reason=images_base` → `images-filtered`
- 仅返回空 body / 无 item → 仍是 `bridge-empty`

日志同时带上 `filter_reason` 与 `attempts`，不再把"被过滤"误报成"作品没了"。

### D3 图文数据映射

`aweme_detail` 中：

| 字段 | 映射 |
|---|---|
| `desc` | 文案（正文） |
| `images[].url_list` | 图集素材（走 `downloadFirstAvailable` + `cdn.ts` 的防盗链头） |
| `author.nickname` | 作者 |
| `statistics.digg_count` 等 | 沿用既有统计 |

`mediaType` 判为 `gallery` 时不做语音转写（图文无音轨），只做图片下载 + 既有 OCR 链路。

### D4 风控与节流

落地作品页属于"用户可见"的正常浏览行为，不额外加重试风暴：一次作品只允许一次类型重试（video → note），避免触发限流。

## 4. 已知限制

- 图文接口需要登录态 profile（`bridge` 已有），匿名仍走不通；
- 若作品确实被作者删除，detail 会返回 `aweme_detail: null` 且 `filter_reason` 为空——此时报 `ssr-no-item`，与"被过滤"区分开；
- 图集数量上限、视频时长等其他限制沿用现状。

## 6. 补充根因：字符串脚本根本没被执行（2026-11-03 实测）

修完 `aid` 参数后图文仍失败，抓出第二层问题：

`public.ts` / `bridge.ts` 里的页内脚本全部写成模板字符串：

```ts
const IN_PAGE_FETCH_SCRIPT = `async (awemeId) => { ... }`;
await page.evaluate(IN_PAGE_FETCH_SCRIPT, targetAwemeId);
```

Playwright 只在收到**函数值**时才带参调用。传字符串时它按表达式求值，得到的是一个函数对象，
序列化回 Node 变成 `undefined`，而且不报错。实测：

```
page.evaluate("async (n) => n * 2", 21)      → undefined
page.evaluate("(async (n) => n * 2)", 21)    → undefined
page.evaluate(async (n) => n * 2, 21)        → 42
```

后果：`SSR_EXTRACT_SCRIPT`、`GET_RENDER_TEXT_SCRIPT`、`IN_PAGE_FETCH_SCRIPT`、`DOM_FALLBACK_SCRIPT`、
bridge 的 `IN_PAGE_XHR_SCRIPT` **五条路径全部恒返回 undefined**，视频能进只是因为碰巧走了网络响应拦截。

修法：`packages/core/src/browser.ts` 新增 `toPageScript(source)`，用 `new Function` 把源码字符串
还原成函数值，再交给 Playwright 调用；调用点统一改为 `page.evaluate(toPageScript(SCRIPT), arg)`。
保留字符串常量形态，改动最小，且不引入 DOM 类型依赖。

## 7. 验证

1. 图文 7408518102100561189：应拿到标题「道家仙人大彻大悟的诗词…#古诗词…」+ 文案 + 图片 N 张；
2. 视频 7703453146412010779：行为与改动前一致（不得回归）；
3. 被过滤场景（模拟 `filter_reason=images_base`）：错误码为 `images-filtered`；
4. `pnpm typecheck` / `pnpm test` 全绿。
