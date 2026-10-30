# Ingestion Facade Specification

## ADDED Requirements

### Requirement: 统一 URL 摄入路由与分发
The system MUST provide a unified facade function `ingest(url: string)` that inspects incoming URLs, automatically routes them to the appropriate handler pod (WebPod or MediaPod), and returns normalized markdown.

#### Scenario: 传入微信公众号或常规网页 URL
- **GIVEN** 用户提供一个标准文章链接（如微信、技术博客或新闻）
- **WHEN** 调用 `ingest(url)`
- **THEN** 系统自动路由至 WebPod，通过 Readability 提取正文并输出符合 RFC 规范的 Markdown。

#### Scenario: 传入抖音短视频或图集 URL
- **GIVEN** 用户提供抖音短链接或作品链接（如 `v.douyin.com`）
- **WHEN** 调用 `ingest(url)`
- **THEN** 系统自动路由至 MediaPod，完成图片下载与 OCR 或音视频转录。
