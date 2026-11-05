# Proposal: Tachikoma 统一多模态情报摄入引擎架构

- **Name**: `tachikoma-ingest-engine`
- **Date**: 2026-10-31
- **Status**: Proposed
- **Author**: qing & Pi (Coordinator)

## 1. 为什么做（Why）

当前个人第二大脑（Ghost）的外部信息摄入存在两套异构且割裂的系统：
1. **`ob-clipper`**：基于 TypeScript + Chrome DevTools Protocol (CDP) 驱动的网页/微信/推文 DOM 剪藏；
2. **`douyin-sync`**：基于 Python + Playwright 桥接 + 本地 Whisper CUDA 转录 + 视觉模型 OCR 的流媒体与图集同步服务。

### 核心痛点
- **心智与交互割裂**：用户或上层 Agent 收到外部链接时，必须先在大脑中判断“这是视频该调 douyin，还是文章该调 clipper”；
- **历史代码质量包袱**：旧项目存在大量早期临时胶水、VBS 开机套娃、以及历史妥协代码；
- **技术栈孤岛**：各自处理去重、各自生成 frontmatter，标准规范分散。

因此，立项 **`Tachikoma`（塔奇克马 —— 攻壳机动队敏捷情报战车）**，作为全机唯一的**统一多模态情报摄入门面（Universal Ingestion Facade）**。

---

## 2. 改什么（What）

在 `Tachikoma` Monorepo 内建立清晰的子应用与模块矩阵：
- **`apps/cli`**：统一交互门面（`tachikoma ingest <URL>` / `tachikoma sync`）；
- **`apps/douyin-sync`**：**【专职子 App】重构自原 douyin-sync，采用全新 TS/现代技术栈**。彻底告别原本散落的 Python 胶水与 VBS，专职负责抖音收藏夹轮询、作品风控绕过、图文与音视频下载、OCR 与转录管线；
- **`apps/web-clipper`**：**【专职子 App】重构自原 ob-clipper**。基于轻量 CDP / Readability 进行微信推文与技术文章 DOM 纯化；
- **`packages/core`**：核心抽象契约、TypeBox Schema、RFC-2026-0922 格式化器与 Ghost `_raw/` 落盘对账引擎；
- **`packages/guard`**：用纯 Rust 编写的静态无控制台后台常驻守护程序（`tachikoma-guard.exe`），彻底淘汰 VBS 与 PowerShell。

```text
                                  ┌─────────────────────────────┐
                                  │       apps/cli (门面)       │
                                  │   (Universal Dispatcher)    │
                                  └──────────────┬──────────────┘
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        ▼                                                 ▼
             ┌─────────────────────┐                           ┌─────────────────────┐
             │   apps/web-clipper  │                           │   apps/douyin-sync  │
             │   (DOM / Article)   │                           │ (抖音收藏与作品重构App) │
             └──────────┬──────────┘                           └──────────┬──────────┘
                        │                                                 │
                        └────────────────────────┬────────────────────────┘
                                                 ▼
                                  ┌─────────────────────────────┐
                                  │        packages/core        │
                                  │   RFC-2026-0922-OKF Format  │
                                  │    Ghost/_raw/ 规范化入库    │
                                  └─────────────────────────────┘
```

1. **统一输入入口**：`tachikoma ingest <URL>`。自动根据域名、协议或内容特征完成模式判定；
2. **第一性编码与现代技术栈**：
   - 纯 TypeScript 构建，严守 `pathe` / `radash` / `outdent` / `typebox` 门禁；
   - 彻底废弃 VBS/PowerShell 胶水，守护进程原生依托 Rust 静态二进制（`tachikoma-guard.exe`）；
3. **分阶段迁移与落地**：
   - Phase 1：架构设计、RFC 契约制定与 OpenSpec 提案全景；
   - Phase 2：`apps/douyin-sync` 全新 TS 规范重构（收藏夹监听 + 签名绕过 + 图集 OCR/转录）；
   - Phase 3：`apps/web-clipper` 零焦点文章剪藏重构；
   - Phase 4：统一 CLI 聚合与 Rust 后台守护。

---

## 3. 影响评估（Impact）

- **新增/重构工程**：`<workspace>/Tachikoma`
- **上层协同**：dotagents skills 中将新增统一的 `tachikoma` 技能，取代割裂的调用路径；
- **Ghost 兼容性**：100% 保持输出至 `Ghost/_raw/` 的不可变底座契约。
