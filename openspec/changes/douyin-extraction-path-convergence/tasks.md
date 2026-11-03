# 任务清单

## 1. 删除失效路径

- [x] 1.1 `public.ts` 保留 `_ROUTER_DATA`（m.douyin.com 分享页匿名依赖），改注释为分享页兜底
- [x] 1.2 `public.ts` 删除 `GET_RENDER_TEXT_SCRIPT` / `extractFromRenderData` 与 render-data 分支（www/m 均无数据）
- [x] 1.3 `public.ts` 的 `extractFromPageContext` 收敛为「XHR → note 重试 → DOM 兜底」
- [x] 1.4 `attempts` 清单同步更新，不再出现已删除路径

## 2. 消除重复兜底

- [x] 2.1 `pipeline.ts` 删除 public 失败后的 `withSyncResources + fetchAwemeDetail` 二次提取
- [x] 2.2 public 抛出的 `DouyinExtractionError`（含 `reason` 与 `attempts`）直接上传调用方
- [x] 2.3 清理因此不再使用的 import（`fetchAwemeDetail` 等按实际引用判断）

## 3. note 重试条件化

- [x] 3.1 仅在失败原因与图文过滤相关（`images-filtered`）或落地页非作品页时重试
- [x] 3.2 同一作品最多重试一次

## 4. 文档

- [x] 4.1 `AGENTS.md` 多路径策略同步为「XHR 主路径 + note 重试 + DOM 兜底」
- [x] 4.2 `design.md` 保留各路径实测判据表

## 5. 验证

- [x] 5.1 `pnpm typecheck` 零错误
- [x] 5.2 `pnpm test` 全绿
- [x] 5.3 实时回归：图文 7408518102100561189（7 图 OCR）
- [x] 5.4 实时回归：视频 7703453146412010779（含转录）
- [x] 5.5 实时回归：匿名视频（不带 profile）仍可提取
- [x] 5.6 实时回归：收藏夹同步单夹，条数与幂等不变

## 实测结论（2026-11-03）

| 场景 | 结果 |
|---|---|
| 图文 7408518102100561189 | ✅ authed-session，7 张图 OCR 全出 |
| 视频 7703453146412010779 | ✅ authed-session，转录 770 字 |
| 匿名视频（无 profile） | ✅ 经 m.douyin.com 分享页 `_ROUTER_DATA` 提取，6.1s |
| 收藏夹同步单夹 | ✅ 新增 1 件图集 |

踩坑修正：最初把 `_ROUTER_DATA` 判为死码，是因为只在 www.douyin.com 上测量。
匿名通道实际会跳转到 m.douyin.com 分享页，那里仍注入该变量——删除会让匿名通道退化为只有标题。
已恢复该路径，只删真正的死码（`#RENDER_DATA`）。
