# 设计：按证据收敛，不按猜测保留

## 1. 判定原则

一条路径是否保留，只看一个判据：**它在当前抖音页面上能否命中**。

- 有实测命中 → 保留；
- 有实测为空且平台已不注入 → 删除；
- 无法证实命中但属于真实降级手段（XHR 失败后才轮到） → 保留，但要在文档标注触发条件。

## 2. 各路径判定

| 路径 | 判据 | 处置 |
|---|---|---|
| `_ROUTER_DATA` | www 恒为空；但 **m.douyin.com 分享页仍带数据**，是匿名通道唯一来源 | 保留（改注释为分享页兜底） |
| `__INITIAL_STATE__` | 恒 `undefined` | 删 |
| `__INIT_PROPS__` | 恒 `undefined` | 删 |
| `#RENDER_DATA` | 20 万字符，`deepFindAwemeItem` 恒 `null`（www 与 m 均无作品数据） | 删 |
| 网络响应拦截 | 匿名视频实测命中过 | 保留 |
| 页内 XHR（带 aid） | 视频 38.7KB / 图文 38.7KB | **主路径** |
| DOM 兜底 | XHR 失败时才执行，未废弃 | 保留，标注触发条件 |
| note 页重试 | 视频页上下文已能取到图文，仅分享链落地需用 | 保留但条件化 |
| pipeline 的 bridge 二次提取 | 与 public 登录态通道完全同构 | 删 |

## 3. 收敛后的单条链路

```
1. 匿名浏览器（mobile UA）→ 页内 XHR(aid) → 命中即返回
2. 若失败且本地存在 authed profile → 持久化上下文 → 同一 XHR → 命中即返回
3. 若返回 images_base 过滤且落地页不是作品页 → 切 /note/{id} 重试一次
4. 仍未命中 → DOM 兜底取标题/作者，标记 confidence=dom-fallback
5. 全败 → DouyinExtractionError(reason, attempts) 直抛给调用方
```

`pipeline.fetchAwemeDetailWithTranscript` 只负责调用它，并把 `reason` 与 `attempts` 原样上报，不再自己另起浏览器兜一遍。

## 4. 为什么不删 DOM 兜底

它是 XHR / 重试都失败后的最后手段，产出的正文可能不完整，但比"整条丢弃"有价值；CLI 已有 `confidence = dom-fallback` 的提示语义。删除它等于把降级能力换成硬失败。

## 5. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 抖音某天恢复 SSR 注入，删掉后少一条路 | 主路径是 XHR，SSR 即便恢复也不是必需；且改动在单一 commit 内可 revert |
| 匿名通道依赖过 SSR（需验证） | 删除后实测匿名视频仍可提取；若不行则恢复并记录 |
| pipeline 删 bridge 后，纯匿名失败信息变少 | 错误对象保留 `attempts`，语义不丢 |

## 6. 验证

1. 图文 7408518102100561189：标题 + 7 图 OCR；
2. 视频 7703453146412010779：标题 + 正文 + 转录；
3. 匿名视频（不带 profile）：仍能成功；
4. 收藏夹同步单个夹：条数与幂等不变；
5. `pnpm typecheck` / `pnpm test` 全绿。
