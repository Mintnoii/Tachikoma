# 任务清单

## 1. 请求上下文修正

- [x] 1.1 `public.ts`：只有 aweme id 时，落地页由 `iesdouyin.com/share/video/{id}` 改为 `www.douyin.com/video/{id}`
- [x] 1.2 `public.ts`：URL 含 `/note/` 时直接落地 `www.douyin.com/note/{id}`
- [x] 1.3 `public.ts`：提取失败时以 `note/{id}` 重试一次（`retryViaNotePage`，同作品最多一次）
- [x] 1.4 重试逻辑抽成独立函数（纯流程，无游标副作用）

## 2. 页面脚本执行修复（本次真正的根因）

- [x] 2.1 `packages/core/src/browser.ts`：新增 `toPageScript()`，把函数源码字符串包成函数值
- [x] 2.2 `public.ts`：`SSR_EXTRACT_SCRIPT` / `GET_RENDER_TEXT_SCRIPT` / `IN_PAGE_FETCH_SCRIPT` / `DOM_FALLBACK_SCRIPT` 全部改为 `page.evaluate(toPageScript(...), arg)`
- [x] 2.3 `bridge.ts`：`IN_PAGE_XHR_SCRIPT` 同样处理
- [x] 2.4 `IN_PAGE_FETCH_SCRIPT` 补 `device_platform=webapp&aid=6383`（缺省时图文被 `images_base` 过滤）

## 3. 失败原因可判读

- [x] 3.1 `errors.ts`：`DouyinExtractionReason` 增加 `images-filtered`
- [x] 3.2 `public.ts`：解析 `filter_detail.filter_reason`，命中 `images_base` 报 `images-filtered`
- [x] 3.3 `filter_reason` 为空且 `aweme_detail` 为空 → `ssr-no-item`
- [x] 3.4 错误信息保留原始 `filter_reason` 与 `attempts`

## 4. 图文数据映射

- [x] 4.1 `images[].url_list` 映射为图集素材（既有 `normalizeAweme` 已覆盖 `aweme_type=68` 与 imageUrls）
- [x] 4.2 `gallery` 跳过语音转写（`pipeline.ts` 既有分支，实测未触发 ASR）
- [x] 4.3 图片下载复用 `downloadFirstAvailable` + `DOUYIN_CDN_HEADERS`

## 5. 验证

- [x] 5.1 `pnpm typecheck` 零错误
- [x] 5.2 `pnpm test` **155 passed / 0 failed**（新增 3 条 `toPageScript` 用例）
- [x] 5.3 真实摄入图文 7408518102100561189：标题「道家仙人大彻大悟的诗词…#古诗词…」/ 作者「星月读诗」/ 媒介「图集」/ 7 张图 OCR 全出
- [x] 5.4 回归：视频 7703453146412010779 摄入正常（标题 + 正文 + 语音转录 770 字）

## 6. 文档

- [x] 6.1 `proposal.md` 保留实测对照表
- [x] 6.2 `design.md` 补「第二根因：字符串脚本不被执行」

## 实测结论（2026-11-03）

两条根因叠加才导致此前的 `bridge-empty`：

1. **页内脚本全是字符串** → Playwright 只求值不调用 → 所有 SSR / XHR / DOM 兜底路径恒返回 `undefined`；
2. **detail 缺 `aid`/`device_platform`** → 图文被 `filter_reason=images_base` 过滤。

修复后视频路径也顺带受益：SSR 与 XHR 两条路真正生效，不再依赖网络拦截偶然命中。
