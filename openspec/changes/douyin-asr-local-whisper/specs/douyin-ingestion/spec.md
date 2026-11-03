## ADDED Requirements

### Requirement: 抖音语音转录经由本地 ASR 服务完成

系统 SHALL 通过 OpenAI 兼容的 `POST /v1/audio/transcriptions` 契约调用本地 ASR 服务完成语音转录，默认端点 `http://127.0.0.1:8000/v1`，不得默认指向不具备 ASR 能力的通用大模型网关。

#### Scenario: 服务可用
- **WHEN** 本地 ASR 服务在默认端点运行且产出 `{"text": "..."}`
- **THEN** 短视频摄入结果包含语音转写正文，且不输出 `[Tachikoma ASR] 语音转录跳过/降级`

#### Scenario: 服务未启动
- **WHEN** 本地 ASR 服务未运行或连接被拒
- **THEN** 摄录取抖音文案描述作为正文，记录包含端点与失败原因的降级日志，抓取主流程不中断

#### Scenario: 仅配置了对话模型网关
- **WHEN** 端点回退到不提供 ASR 模型的网关（如 Magpie 的 `whisper-1` 返回 `not_found_error`）
- **THEN** 视为转写不可用并降级，错误信息保留 HTTP 状态与响应体片段以便定位

### Requirement: 专名词表参与解码

系统 SHALL 读取 `apps/douyin-sync/config/asr_glossary.yaml` 中 `status: verified` 的词条，拼接为 `prompt` 字段随转写请求发送，词条上限 64 条。

#### Scenario: 词表命中
- **WHEN** 词表包含 verified 词条且转录请求发出
- **THEN** 请求携带由这些词条组成的 `prompt`，专名写法在解码阶段被约束

#### Scenario: 词表缺失或损坏
- **WHEN** 词表文件不存在或 YAML 解析失败
- **THEN** 请求不携带 `prompt`，转写照常进行且不抛错
