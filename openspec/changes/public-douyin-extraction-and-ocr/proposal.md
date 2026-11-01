# Proposal: 抖音单条公开作品零Cookie免登录极速解析与图集全量OCR闭环

- **Name**: `public-douyin-extraction-and-ocr`
- **Date**: 2026-11-01
- **Status**: Proposed
- **Author**: qing & Pi (Coordinator)
- **Background**:
  - 用户痛点：微信发单条抖音图文链接时，目前仅录入了标题和转发文案，没有真正打通多模态图集 OCR 转录；
  - 核心认知：单条公开作品属于公开数据，**绝不需要用户的个人账号登录态与 Cookie**。个人登录态只在收藏夹批量对账时需要；
  - 交付目标：在 `Tachikoma` 原生 TS 中实现单条公开作品的匿名/免登录直通解析（获取视频源或全量图集原图列表），如果是图集作品自动投递给 Magpie 视觉大模型执行全量 OCR 转录，存入 Sparks 随身军械库，并在微信回执中输出高密度的核心内容要点，杜绝盲盒。

---

## 1. 详细设计 (What)

### 1.1 纯内存匿名解析器 (`fetchPublicAwemeItem`)
在 `apps/douyin-sync/src/client.ts` 或 `public_extractor.ts` 中实现：
- 使用 Playwright 极简无痕无头上下文（`headless: true`, 零 Cookie、零 Profile 目录，彻底匿名）；
- 模拟移动端 iPhone User-Agent 访问重定向后的分享页面 `https://www.iesdouyin.com/share/note/<id>` 或 `share/video/<id>`；
- 在页面执行环境或网络拦截中提取作品完整结构（作者昵称、视频链接或全量高清图片列表 `images`）；
- 资源用完即释放，不留下任何浏览器常驻痕迹。

### 1.2 全量图集视觉 OCR
- 拿到作品的多张图片 URL 后，直接调用现有的 `apps/douyin-sync/src/ocr.ts`；
- 并发投递给 Magpie 视觉模型（`auto/gemini-3.8-flash`）；
- 将多张切片的文字精准转录并拼接为 Markdown 正文。

### 1.3 军械库录入与即时直出核心摘要
- 将完整 OCR 内容或语音转录内容写入 `sparks.db` 的 `content`；
- 在 CLI 输出端提供结构化核心洞察提取（如 3~5 点干货摘要）；
- 微信网关回复时，不仅出示军械库标签，直接展示核心正文要点，解决“不知道收录了什么”的体验痛点。

---

## 2. 任务清单 (Tasks)

- [x] Task 1: 编写单条公开作品匿名解析器 `apps/douyin-sync/src/public.ts`，零个人凭据提取视频或图集图片 URL
- [x] Task 2: 改造 `apps/cli/src/cli.ts` 中的 `ingestDouyinToSparks`，对图集作品自动接入全量 OCR 转录
- [x] Task 3: 优化灵感军械库录入输出，自动提取并直出作品核心内容摘要与干货脉络
- [x] Task 4: 编写单元测试验证匿名解析与 OCR 组装，全量回归验证
