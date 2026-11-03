## ADDED Requirements

### Requirement: 单条作品提取路径

系统 SHALL 以页内同源 XHR（携带 `device_platform=webapp&aid=6383`）作为单条作品的主提取路径，并在失败时按「note 页重试 → DOM 兜底」顺序降级；SHALL NOT 依赖页面 SSR 注入变量（`_ROUTER_DATA` / `__INITIAL_STATE__` / `__INIT_PROPS__`）或 `#RENDER_DATA`，因其在当前页面恒为空。

#### Scenario: 视频页提取
- **WHEN** 摄入一条视频作品
- **THEN** 系统通过页内 XHR 取得 `aweme_detail` 并返回标题、正文、作者与播放地址

#### Scenario: 图文被上下文过滤
- **WHEN** XHR 返回 `aweme_detail: null` 且 `filter_reason=images_base`
- **THEN** 系统切换到 `www.douyin.com/note/{id}` 重试一次并成功提取图文，且该重试每作品最多一次

#### Scenario: 主路径失败
- **WHEN** XHR 与重试均未命中
- **THEN** 系统执行 DOM 兜底，命中时标记 `confidence = "dom-fallback"`，全败时抛出携带 `reason` 与 `attempts` 的 `DouyinExtractionError`

### Requirement: 提取链路不得重复兜底

系统 SHALL 由 `fetchPublicAwemeItem` 统一负责匿名与登录态两次提取，调用方（如 `pipeline.fetchAwemeDetailWithTranscript`）SHALL NOT 在失败后再以同源桥接重复提取同一作品。

#### Scenario: 登录态下提取图文
- **WHEN** 本地存在有效登录态 profile 且匿名提取返回 403
- **THEN** 系统在同一次调用内以持久化上下文完成重试，调用方直接获得结果或错误，不再额外启动浏览器

### Requirement: 图集在批量同步中不依赖详情接口

系统 SHALL 在收藏夹批量同步中直接使用列表接口内联的 `images` 数据，SHALL NOT 为图集额外调用详情接口。

#### Scenario: 同步含图集的收藏夹
- **WHEN** 收藏夹列表返回 `aweme_type=68` 的图文作品
- **THEN** 系统使用列表返回的图片地址完成下载与 OCR，不触发详情接口
