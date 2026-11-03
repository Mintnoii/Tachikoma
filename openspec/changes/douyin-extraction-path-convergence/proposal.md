# 抖音提取链路收敛：删除已死路径与重复兜底

## 为什么

2026-11-03 修完 `toPageScript` 与 `aid` 参数后，提取链路里积累的兜底开始失真：一部分是抖音早已不再注入的字段（真死代码），一部分是同一件事被做了三遍（重复劳动）。

实测证据（登录态 profile，同一会话）：

| 探测项 | 视频页 | 图文作品页 | 结论 |
|---|---|---|---|
| `_ROUTER_DATA.loaderData` 键 | `[]` | `[]` | www 页面无数据（m.douyin.com 分享页仍有，匿名通道依赖它） |
| `window.__INITIAL_STATE__` | `false` | `false` | 同上 |
| `window.__INIT_PROPS__` | `false` | `false` | 同上 |
| `#RENDER_DATA` 长度 | 209,580 | 209,579 | 存在但是页面配置 |
| `extractFromRenderData()` 命中 | `false` | `false` | render-data 路径失效（www 与 m 均如此） |
| 页内 XHR（带 `aid`） | `200 / 38,731B` | `200 / 38,726B` | 唯一稳定路径 |

同时 `public.ts` 的匿名 → 登录态双层，加上 `pipeline.ts` 再补一次同源桥接，等于同一份数据要经三次浏览器上下文才落地：

```
public 匿名（视频可成 5.9s / 图文必 403）
  → public 登录态（再起一次浏览器）
    → pipeline 的 withSyncResources + fetchAwemeDetail（第三次）
```

## 目标

1. 删除确证失效的路径（`#RENDER_DATA` 解析、`__INITIAL_STATE__` / `__INIT_PROPS__` 分支），并保留 `_ROUTER_DATA` 作为 m.douyin.com 分享页的匿名兜底；
2. 消除 pipeline 与 public 之间的重复兜底：图文单条摄入不再多起一次浏览器；
3. 失败原因与 `attempts` 语义保持可判读，不因收敛而退化成 `bridge-empty`；
4. 图集、视频、收藏夹同步三条真实链路回归通过。

## 非目标

- 不改匿名通道：视频匿名仍可提取，图文匿名仍 403（平台行为）；
- 不逆向签名、不接 App 端接口；
- 不删除 DOM 兜底（它是真实降级手段，只在 XHR 失败时触发，不属于死码）。

## 影响面

| 区域 | 变更 |
|---|---|
| `apps/douyin-sync/src/public.ts` | 删 3 段 SSR 脚本 + render-data 分支；note 重试仅在需要时触发 |
| `apps/douyin-sync/src/pipeline.ts` | 删除 public 失败后的 bridge 二次提取，错误直传 |
| `AGENTS.md` | 多路径策略描述同步为「XHR 主路径 + note 重试 + DOM 兜底」 |
| `tests/` | 增补失败原因与链路收敛的行为用例 |
