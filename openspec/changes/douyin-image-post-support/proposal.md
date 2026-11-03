# 抖音图文（图集）作品摄入支持

## 为什么

同一批抖音素材里，**视频能进，图文（note/images）全失败**。

2026-11-03 实测（登录态 profile）：

| 请求来源 | 作品 | detail 接口结果 |
|---|---|---|
| 从 `www.douyin.com` 首页发起 | 图文 7408518102100561189 | `200` 但 `{"aweme_detail": null, "filter_detail": {"filter_reason": "images_base"}}` |
| 从 `www.douyin.com/note/7408518102100561189` 发起 | 同一作品 | `200`，`aweme_detail` 完整，38,735 字节 |
| 从 `www.douyin.com` 首页发起 | 视频 7703453146412010779 | `200`，正常 41,304 字节 |

结论：**不是作品下架、不是接口下线**，而是抖音按「请求上下文」过滤图文——只有从该图文作品页自身发出的请求才放行（`filter_reason=images_base` 是给外部的拒绝标记）。

而当前实现（`public.ts`）在只有 aweme id 时，把浏览器导航到 `https://www.iesdouyin.com/share/video/{id}`（分享页），再从那里发 in-page XHR —— 上下文不对，图文必然被过滤，最终报 `bridge-empty`，看起来像"作品没了"。

## 目标

1. 图文作品能正常摄入：标题、文案、图片列表、作者；
2. 图文请求被过滤时，报出**可判读的失败原因**（`images-filtered`），不再是含糊的 `bridge-empty`；
3. 不改变视频路径的既有行为（视频已通过验证）。

## 非目标

- 不逆向 `a_bogus` / `UIFID` 等签名算法；
- 不接入 App 端私有接口；
- 不做图片 OCR 的算法改造（现有图集 OCR 链路沿用）。

## 影响面

| 区域 | 变更 |
|---|---|
| `packages/core/src/browser.ts` | 新增 `toPageScript()`，页内脚本改以函数值执行 |
| `apps/douyin-sync/src/public.ts` | 落地页改用作品页、note 重试、`aid` 参数、过滤原因解析 |
| `apps/douyin-sync/src/bridge.ts` | `IN_PAGE_XHR_SCRIPT` 走 `toPageScript` |
| `apps/douyin-sync/src/client.ts` | `fetchAwemeDetail` 补 `device_platform` / `aid` |
| `apps/douyin-sync/src/errors.ts` | 新增失败原因 `images-filtered` |
| `tests/page-script.test.ts` | 3 条 `toPageScript` 用例 |

## 交付结果（2026-11-03）

| 项 | 结果 |
|---|---|
| 图文作品 7408518102100561189 | ✅ 标题、作者「星月读诗」、7 张图 OCR 全出 |
| 视频作品 7703453146412010779 | ✅ 标题 + 正文 + 语音转录 770 字，无回归 |
| `pnpm typecheck` | ✅ 0 错误 |
| `pnpm test` | ✅ 155 passed / 0 failed |

真正的根因有两条，叠加造成此前的 `bridge-empty`：页内脚本以字符串形式传给 `page.evaluate` 从未被执行（恒返回 `undefined`）；detail 接口缺 `aid`/`device_platform` 导致图文被 `images_base` 过滤。详见 `design.md` 第 6 节。
