# 抖音 ASR 复原：本地 faster-whisper 服务 + 专名词表回注

## 为什么

抖音语音转录在 TypeScript 重写后**长期静默失效**，真实症状是 `[Tachikoma ASR] 语音转录跳过/降级`，健康度看不出来。

归因链条（2026-11-03 实测）：

1. 媒体下载 403 —— `downloadAsset` 与 ASR 模块各自用裸 `fetch`，缺 CDN 防盗链头。**已修**（`cdn.ts` 统一常量 + 多线路轮换）。
2. 下载通了之后暴露真正的历史遗留问题：ASR 端点指向 `http://127.0.0.1:3425/v1`（Magpie 网关），模型名 `whisper-1`，Magpie 回 `not_found_error`。Magpie 的四个 provider 全是对话模型，没有任何 ASR 能力。
3. 对照原 Python 实现（`Desktop/douyin-sync/core/transcript_manager.py`）：默认 `backend: whisper` = **进程内 faster-whisper 推理**（CTranslate2，`medium` + `cuda` + `BatchedInferencePipeline` + `vad_filter` + 专名词表 `initial_prompt`）。HTTP 那条（`_call_openai_transcription`）在旧版只是**备用分支**。

即：Node 跑不了 CTranslate2，移植时把「进程内推理」降级成「HTTP 客户端」，但从未提供对应的服务端，且**丢掉了专名词表注入**（TS 版 `asr.ts` 中 `prompt`/`glossary` 出现 0 次）。

## 目标

1. 提供本地 ASR 服务，复用已有的 `faster-whisper-medium`（1.5G，`~/.cache/huggingface/hub` 已就位），协议对齐 OpenAI `POST /v1/audio/transcriptions`；
2. TS 侧恢复 `initial_prompt` 专名词表注入，等价于 Python 版 `config/asr_glossary.yaml` 行为；
3. 服务未启动时仍然降级不崩，不阻断短视频抓取主链路。

## 非目标

- 不引入 Node 原生 whisper 绑定（nodejs-whisper / whisper.cpp binding），维护成本高于收益；
- 不在本次引入云端 ASR 采购（Magpie 加 Groq/OpenAI provider 仍保留为可选替代路径，不改代码即可切换）；
- 不动 Ghost 知识库、收藏夹同步、Sparks 数据结构。

## 影响面

| 区域 | 变更 |
|---|---|
| `services/asr/`（新增） | FastAPI/uvicorn 服务，OpenAI 兼容转写端点 |
| `apps/douyin-sync/src/asr.ts` | 默认端点改 8000、新增 `prompt` 字段注入 |
| `apps/douyin-sync/config/asr_glossary.yaml` | 被 TS 侧真正读取（此前无人读） |
| `apps/douyin-sync/src/cdn.ts` | 已存在，本轮不动 |
