# proposal: 抖音作者主页 (Authors) 与合集专栏 (Mixes) 增量同步能力迁移与落地

## 1. 变更背景与核心诉求
原 Python 版本（`Desktop/douyin-sync`）具备三位一体的同步架构：收藏夹（collections）、作者主页（authors）与合集专栏（mixes）。
在重构为 TypeScript 版 Tachikoma 时，第一阶段仅聚焦于收藏夹同步。用户明确提出需要将作者主页（如“神经元出逃计划”）与合集专栏同步完整迁移回 Tachikoma，以便将高价值博主的体系化输出自动流转至第二大脑 Ghost 不可变底座。

## 2. 核心架构与契约设计
1. **同源接口与分页拉取**：
   - 合集作品：`/aweme/v1/web/mix/aweme/?mix_id={id}&cursor={cursor}&count=20&device_platform=webapp&aid=6383`
   - 作者主页作品：`/aweme/v1/web/aweme/post/?sec_user_id={sec_uid}&max_cursor={cursor}&count=18&device_platform=webapp&aid=6383`
   - 统一遵循 `BrowserBridge` 签名环境与全量游标分页器规范（`fetchAllMixAwemes`, `fetchAllAuthorAwemes`）。
2. **断点检查点（Checkpoints）与增量对账**：
   - 扩展 `sync_checkpoints` 维度：`target_type = "author"`（target_id 为 `sec_uid`），`target_type = "mix"`（target_id 为 `mix_id`）；
   - 结合 SQLite `synced_awemes` 表与 Ghost 墓碑账本，做到三层防重拦截。
3. **Ghost 知识库落盘目录规范**：
   - 收藏夹：`Ghost/_raw/douyin/<folderName>/<title>.md`
   - 作者主页：`Ghost/_raw/douyin/authors/<nickname>/<title>.md`
   - 合集专栏：`Ghost/_raw/douyin/mixes/<mixName>/<title>.md`
4. **配置支持与 CLI 拓展**：
   - `sync_rules.yaml` 增加 `authors` 与 `mixes` 节点，迁移原 `config.yml` 配置（如“神经元出逃计划”）；
   - `tachikoma sync` 默认一键跑通三轨；同时支持 `--author <sec_uid>` 与 `--mix <mix_id>` 单独触发。
