## ADDED Requirements

### Requirement: 图文作品经作品页上下文摄入

系统 SHALL 在提取图文（images）作品时，从该作品自身的页面上下文（`https://www.douyin.com/note/{aweme_id}`）发起详情请求，而不是从分享页或站点首页发起。

#### Scenario: 图文作品可正常提取
- **WHEN** 摄入图文作品且登录态有效
- **THEN** 系统返回标题、文案、作者与图片列表，`mediaType` 为 `gallery`

#### Scenario: 仅有 aweme id 且类型未知
- **WHEN** 输入只有 aweme id，首次以视频页上下文请求命中 `filter_reason=images_base`
- **THEN** 系统以 `note/{id}` 上下文重试一次并成功提取，且该重试对同一作品最多发生一次

### Requirement: 图文被过滤时给出可判读失败原因

系统 SHALL 解析详情响应中的 `filter_detail.filter_reason`，并在其等于 `images_base` 时以 `images-filtered` 作为失败原因，不得统一报 `bridge-empty`。

#### Scenario: 上下文不正确导致被过滤
- **WHEN** 详情接口返回 `aweme_detail` 为空且 `filter_reason` 为 `images_base`
- **THEN** 失败原因记为 `images-filtered`，错误信息包含原始 `filter_reason`

#### Scenario: 作品确实不存在
- **WHEN** 详情接口返回 `aweme_detail` 为空且无 `filter_reason`
- **THEN** 失败原因记为 `ssr-no-item`，与"被过滤"区分

### Requirement: 图集不执行语音转写

系统 SHALL 对 `mediaType=gallery` 的作品跳过语音转录，仅下载图片素材，避免对无音轨内容发起无效 ASR 请求。

#### Scenario: 图集摄入
- **WHEN** 作品 `mediaType` 为 `gallery`
- **THEN** 系统不调用 ASR 服务，只下载图片并写入素材目录
