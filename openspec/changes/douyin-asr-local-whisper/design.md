# 设计：本地 ASR Sidecar

## 1. 为什么是 Sidecar 而不是 Node 绑定

`faster-whisper` 依赖 CTranslate2（C++ 推理引擎）+ PyAV 解码，Node 侧无等价成熟绑定。可选路径三条：

| 方案 | 代价 | 判定 |
|---|---|---|
| Node 原生 whisper 绑定 | 需重编 native 模块，Windows 下 ABI 摩擦大 | 否决 |
| 云端 ASR（Magpie 加 provider） | 零代码，但需 key + 联网 + 按量计费 | 保留为可选，非默认 |
| 本地推理 Sidecar（HTTP） | 一次服务，复用已有模型与算力 | **采纳** |

Sidecar 把「推理」与「编排」解耦，Node 只认 HTTP 契约，未来换引擎不改 TS。

### 决策修订（2026-11-03）：Sidecar 实现必须是零解释器二进制

初版把 Sidecar 实现成 `services/asr/server.py`（FastAPI + faster-whisper），**违反本项目 TS + Rust 技术栈**，且反向引入了项目正在淘汰的胶水形态（Python 解释器 + venv + pip + `start.ps1`）。qing 当场指出后推翻。

**改判**：Sidecar 采用 whisper.cpp 官方 `whisper-server`（C++ 编译产物，单 exe，无解释器），来自官方 Windows CUDA 12.4 预编译包。

| 维度 | Python Sidecar（已废弃） | whisper.cpp Sidecar（现行） |
|---|---|---|
| 运行时依赖 | Python 3.11 + venv + pip + CUDA wheel | 单个 exe（内含 CUDA 运行库） |
| 仓库体积 | `.venv` 2.3G | `bin/` 约 685M（gitignore） |
| 协议 | 自写 OpenAI 兼容层 | 原生 `--inference-path "/v1/audio/transcriptions"` |
| 专名词表 | 自写 `prompt` 注入 | 原生支持 `prompt` form 字段 |
| 技术栈一致性 | ✗ 跨栈 | ✓ 二进制，与 Rust guard 同级 |
| 批处理 | `BatchedInferencePipeline` | 单请求（本场景无差异） |

**判据（写入项目宪法）**：任何外部能力接入，要么是纯 TS/Rust 代码，要么是无解释器二进制；禁止为了省事引入 Python / Node 之外的解释器运行时。

## 2. 服务契约

`POST /v1/audio/transcriptions`，`multipart/form-data`：

| 字段 | 必需 | 说明 |
|---|---|---|
| `file` | ✓ | 音频/视频二进制 |
| `model` | | 本地模型尺寸映射，接受 `whisper-medium` / `medium` / 任意含尺寸关键字的串；缺省取 `TACHIKOMA_ASR_MODEL` 或 `medium` |
| `language` | | 缺省 `zh` |
| `prompt` | | 专名词表，解码阶段注入 initial_prompt |
| `response_format` | | 仅支持 `json`，返回 `{"text": "..."}` |

附加端点：`GET /healthz` 返回 `{status, model, device, loaded}`，供 Tachikoma 探活与运维脚本使用。

错误语义：模型未加载/解码失败返回 4xx/5xx 且 body 为 `{"error": {"message": ...}}`，与 OpenAI 一致，Tachikoma 现有错误解析无需改动。

## 3. 模型与设备

- 模型：`faster-whisper` 的 `medium`（对应 `Systran/faster-whisper-medium`），已缓存，首次启动不下载；
- 设备：`device=cuda` 可用则用，否则回退 `cpu` + `compute_type=int8`；用环境变量 `ASR_DEVICE` / `ASR_COMPUTE_TYPE` 覆盖；
- 懒加载：进程启动不加载模型，首个请求或 `/healthz?load=1` 时加载，避免常驻吃显存。

## 4. TS 侧改动

1. `asr.ts` 默认 `baseUrl` 由 `http://127.0.0.1:3425/v1` 改为 `http://127.0.0.1:8000/v1`（Magpie 无 ASR 模型，留它在默认位只会持续 404）；
2. 新增 `prompt` 表单字段：读取 `config/asr_glossary.yaml`，仅取 `status: verified` 词条，格式 `correct` 优先、上限 64 条（超长会被 whisper 静默截断），拼接为逗号分隔串；
3. 词表读取失败一律视为无 prompt，不阻断转写（与既有 `tryit` 降级风格一致）；
4. 保留 `TACHIKOMA_ASR_BASE_URL` / `_MODEL` / `_API_KEY` / `_LANGUAGE` 全部覆盖能力，切云端只需改环境变量。

## 5. 启动与运维

服务目录 `services/asr/`，包含 `server.py`、`requirements.txt`、`README.md`、`start.ps1`（Windows 便捷启动）。默认端口 8000，`ASR_PORT` 可覆盖。Tachikoma 不负责拉起该服务：服务未运行时沿用现有 `tryit` 降级，日志保留可诊断信息（HTTP 状态 + body 前 200 字符）。

## 6. 风险

| 风险 | 处置 |
|---|---|
| 服务未启动 → 转录静默缺失 | `/healthz` 探活 + 摄入口径降级日志已含原因，README 写明启动步骤 |
| CUDA 不可用 | 自动回退 CPU int8，速度慢但可用 |
| 长视频超时 | 沿用 `TACHIKOMA_ASR_TIMEOUT_MS`（默认 30s）需按视频时长放宽，README 标注 |
