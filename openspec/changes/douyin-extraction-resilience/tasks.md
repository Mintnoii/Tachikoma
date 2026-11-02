# Tasks: 抖音匿名解析链路抗改版加固

## 1. 错误类型与桥接收窄

- [x] 1.1 在 `apps/douyin-sync/src/` 新增 `errors.ts`，定义 `DouyinExtractionError`（`reason` 枚举 + `attempts: string[]` + `cause?`）
- [x] 1.2 `bridge.ts` 的 `requestJson` 对 `page.evaluate` 返回值做显式收窄：`undefined`/非对象 → 抛 `bridge-empty`，携带 path 与 params
- [x] 1.3 收窄 `IN_PAGE_XHR_SCRIPT` 的返回契约（页面脚本必须回 `{ok,status,data,error}`），缺字段时按 `bridge-empty` 处理

## 2. 深度发现与多路径提取

- [x] 2.1 `public.ts` 新增纯函数 `deepFindAwemeItem(value, maxDepth = 8)`：递归搜索 `item_list[0]` / `aweme_detail` / `aweme_id+video|images`，带 visited 集合防环
- [x] 2.2 `_ROUTER_DATA` / `__INITIAL_STATE__` / `__INIT_PROPS__` 统一走 `deepFindAwemeItem`，删除「只扫一层 `Object.values`」的假设
- [x] 2.3 新增 `<script id="RENDER_DATA">` 的 URI 解码 + JSON 解析路径
- [x] 2.4 新增页内同源 XHR 路径：`page.evaluate` 内 `fetch('/aweme/v1/web/aweme/detail/?aweme_id=...')`，失败按 `api-forbidden` 归类
- [x] 2.5 每次提取返回 `{ source, confidence }`，`source ∈ ssr | render-data | in-page-xhr | dom`，`dom` 时 `confidence = "dom-fallback"`

## 3. CLI 失败回执结构化

- [x] 3.1 `ingestDouyinToSparks` 捕获 `DouyinExtractionError`，输出「失败原因 + 已尝试路径清单」，不再打印 TypeError
- [x] 3.2 兜底命中（`dom-fallback`）时回执显式标注「正文可能不完整，建议后续 spark distill 补齐」
- [x] 3.3 校验失败路径下 `sparks.db` 不产生半成品记录

## 4. 测试与验证

- [x] 4.1 单测：`deepFindAwemeItem` 在任意嵌套深度命中（含 5 层与数组内嵌套）
- [x] 4.2 单测：`requestJson` 收到 `undefined` 抛 `bridge-empty` 而非 TypeError
- [x] 4.3 单测：`RENDER_DATA` URI 解码路径
- [x] 4.4 真实链路冒烟：用 `https://v.douyin.com/5BKzcil9tiQ/`（aweme_id `7703453146412010779`）跑通摄入，或输出结构化失败原因
- [x] 4.5 `pnpm typecheck` + `pnpm test` 全绿

## 5. 文档对齐

- [x] 5.1 更新 `openspec/changes/douyin-extraction-resilience/specs/douyin-ingestion/spec.md` 的 delta 与最终基线一致
- [x] 5.2 在 `AGENTS.md` 或 `README.md` 记录抖音解析的失败分类语义（便于后续排障）

## 实测结果（2026-11-02，真实链接 `v.douyin.com/5BKzcil9tiQ`）

```
[Tachikoma] 检测到单条抖音链接，转入 Sparks 灵感流: https://v.douyin.com/5BKzcil9tiQ/
[Tachikoma] 抖音摄入失败: [PublicAweme] 无法从作品页面提取数据
  失败原因 (reason):   dom-fallback-empty
  已尝试路径 (attempts):
    • ssr:_ROUTER_DATA
    • ssr:__INITIAL_STATE__
    • ssr:__INIT_PROPS__
    • render-data
    • in-page-xhr:/aweme/v1/web/aweme/detail/?aweme_id=7703453146412010779
    • dom-fallback
```

结论：TypeError 掩盖问题已根治，失败原因与尝试路径全透明。但抖音已对无登录态的分享页抽空 SSR 数据、同源接口亦不放行，**匿名路径客观上无法再取到作品正文**。若要真正取到内容，需引入「本机已登录浏览器 CDP 会话」兜底，属新的变更范围（见 design.md 的 Open Questions）。
