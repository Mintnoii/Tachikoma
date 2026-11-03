# Tachikoma 本地 ASR 服务（whisper.cpp 二进制 Sidecar）

基于 [whisper.cpp](https://github.com/ggml-org/whisper.cpp) 官方 `whisper-server` 的本地语音转写服务。**零解释器**：单 exe + 一份 ggml 模型权重，由 `packages/guard`（Rust）托管，向上暴露 OpenAI 兼容的 `POST /v1/audio/transcriptions`。

---

## 1. 为什么是二进制而不是 Python

本项目技术栈是 **TypeScript + Rust**。初版曾用 `faster-whisper` + FastAPI 实现（`server.py` / `start.ps1` / `.venv`），被判定为**违反栈约束**并推翻——它反向引入了项目正在淘汰的胶水形态（解释器 + venv + pip + 启动脚本）。

| 维度 | Python 实现（已废弃） | whisper.cpp（现行） |
|---|---|---|
| 运行时 | Python 3.11 + venv + pip | 单个 `whisper-server.exe` |
| 体积 | `.venv` 2.3G | `bin/` 约 685M + 模型约 1.5G（均 gitignore） |
| 协议 | 自写兼容层 | 原生 `--inference-path "/v1/audio/transcriptions"` |
| 专名词表 | 自写表单注入 | 原生 `prompt` form 字段 |
| 进程管理 | 需 start.ps1 | 由 Rust guard 拉起、探活、自愈 |

判据已写入 `AGENTS.md`：外部能力要么纯 TS/Rust 代码，要么无解释器二进制。

---

## 2. 目录与依赖

```text
services/asr/
├── bin/                       # whisper.cpp 官方预编译包解压目录（gitignore）
│   ├── whisper-server.exe
│   └── *.dll                  # 内置 CUDA 运行库
├── models/
│   └── ggml-medium.bin        # ggml 权重（gitignore）
└── README.md
```

首次部署需要两份外部文件（**只下载一次**）：

```bash
cd services/asr

# 1) whisper.cpp 官方 Windows CUDA 12.4 预编译包（约 685MB，自带 CUDA 运行库）
curl -L --ssl-no-revoke -C - --retry 40 --retry-all-errors \
  -o bin/whisper-cuda.zip \
  "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-win-cuda-12.4.0-x64.zip"

# 2) ggml 模型权重（约 1.5GB，国内走 hf-mirror）
curl -L --ssl-no-revoke -C - --retry 40 --retry-all-errors \
  -o models/ggml-medium.bin \
  "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin"
```

解压（PowerShell，一次性；官方包会多套一层 `Release/`，需拍平）：

```powershell
Expand-Archive -Path bin/whisper-cuda.zip -DestinationPath bin -Force
Move-Item bin/Release/* bin/ -Force
Remove-Item bin/Release -Recurse -Force
Remove-Item bin/whisper-cuda.zip
```

解压后 `bin/` 里直接是 `whisper-server.exe` 加 22 个 DLL（含 `cublas64_12.dll` / `ggml-cuda.dll`）。先用 `--help` 验证 CUDA 后端能识别显卡。

> 纯 CPU 机器可换 `whisper-bin-x64.zip`（8.9MB，无 CUDA 依赖）。
> 换模型尺寸只改文件名：`ggml-small.bin` / `ggml-large-v3.bin`，并同步改 `TACHIKOMA_ASR_MODEL_PATH`。

---

## 3. 启动方式

### 3.1 推荐：交给 Rust 守护进程（零手动）

`packages/guard`（`tachikoma-guard.exe`，随开机自启）负责：

- 启动 5 秒后拉起 `whisper-server.exe`
- 每 10 秒 TCP 探活 8000 端口
- 子进程退出立即重启
- 二进制或模型缺失时只记一次日志，不影响收藏夹同步

**日常不需要手动启动任何东西。**

### 3.2 手动启动（仅调试用）

```bash
./services/asr/bin/whisper-server.exe \
  --model services/asr/models/ggml-medium.bin \
  --host 127.0.0.1 --port 8000 \
  --inference-path "/v1/audio/transcriptions" \
  --language auto --no-timestamps --processors 1
```

---

## 4. 配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `TACHIKOMA_ASR_PORT` | `8000` | 守护进程拉起服务用的端口，需与 TS 侧 `TACHIKOMA_ASR_BASE_URL` 一致 |
| `TACHIKOMA_ASR_BIN` | `services/asr/bin/whisper-server.exe` | 自定义二进制路径 |
| `TACHIKOMA_ASR_MODEL_PATH` | `services/asr/models/ggml-medium.bin` | 自定义模型路径 |
| `TACHIKOMA_GUARD_ASR` | 未设置 | 设为 `0` 关闭 ASR 守护（只保留收藏夹同步） |
| `TACHIKOMA_SYNC_INTERVAL_SECS` | `1800` | 同步轮询间隔；`0` = 只守护 ASR、不跑同步 |

守护日志：`~/.tachikoma/guard.log`（含拉起 pid、退出码、重启记录）。

TS 侧（`apps/douyin-sync/src/asr.ts`）另有：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `TACHIKOMA_ASR_BASE_URL` | `http://127.0.0.1:8000/v1` | 转写服务地址 |
| `TACHIKOMA_ASR_MODEL` | `whisper-medium` | 表单 `model` 字段（whisper-server 忽略，按 `--model` 权重走） |
| `TACHIKOMA_ASR_LANGUAGE` | `zh` | 语言提示 |
| `TACHIKOMA_ASR_TIMEOUT_MS` | `600000` | 推理超时（CPU 慢路径需放宽） |
| `TACHIKOMA_ASR_DOWNLOAD_TIMEOUT_MS` | `60000` | 下载音视频源超时 |

---

## 5. 接口契约

### 5.1 转写（`POST /v1/audio/transcriptions`）

`multipart/form-data`：

| 字段 | 必需 | 说明 |
|---|---|---|
| `file` | ✓ | **必须是 WAV**（16k 单声道）。whisper-server 官方构建不带 ffmpeg，其它格式由 TS 侧用 ffmpeg 转码后再送 |
| `model` | | 任意值，服务端忽略（权重由启动参数 `--model` 决定） |
| `language` | | ISO-639-1；缺省用启动时的 `--language auto` |
| `prompt` | | 专名词表，映射到 `initial_prompt` |
| `response_format` | | `json` → `{"text": "..."}` |

```bash
curl http://127.0.0.1:8000/v1/audio/transcriptions \
  -F "file=@sample.mp3" \
  -F "model=whisper-medium" \
  -F "language=zh" \
  -F "prompt=WorkBuddy, ffmpeg, yt-dlp, GitHub, Lightpanda"
```

### 5.2 探活

whisper-server 没有 `/healthz`；守护进程用 **TCP 连通性**判定存活（不依赖具体路由）。需要 HTTP 探活时用 `GET /`（返回内置测试页）。

---

## 6. 已知差异与排障

- **只收 WAV**：官方 `whisper-server` 编译时未启用 ffmpeg。TS 侧 `src/media.ts` 用系统 `ffmpeg` 先转成 16k 单声道 WAV（`TACHIKOMA_FFMPEG_BIN` 可指定路径），ffmpeg 缺失时降级为无转录，不中断抓取。
- **无批处理**：Python 版有 `BatchedInferencePipeline`，whisper.cpp 是单请求推理。实测 RTX 4060 Ti + medium：10 秒音频约 0.9 秒。
- **`prompt` 是服务端全局可变参数**：whisper-server 每次请求会改写自己的 `params.prompt`，单客户端（我们的场景）无影响；不要多人并发共用同一实例。
- **CUDA 包体积**：`whisper-bin-win-cuda-12.4.0-x64.zip` 自带 CUDA 运行库，不需要另装 Toolkit；驱动版本过低时改用 `whisper-bin-x64.zip`（CPU）。
- **下载卡住**：GitHub / HF 直连在本机走代理常报 `CRYPT_E_REVOCATION_OFFLINE`，加 `--ssl-no-revoke` 并用 `-C -` 断点续传。

---

## 7. 切换后端

TS 侧只认 OpenAI 协议，换后端只要改环境变量：

```bash
# 本地 whisper.cpp（默认）
TACHIKOMA_ASR_BASE_URL="http://127.0.0.1:8000/v1"

# OpenAI 云端
TACHIKOMA_ASR_BASE_URL="https://api.openai.com/v1"
TACHIKOMA_ASR_API_KEY="sk-..."
TACHIKOMA_ASR_MODEL="whisper-1"

# Magpie 网关（仅当上游配置了 ASR 模型时；当前其 provider 全是对话模型，会 404）
TACHIKOMA_ASR_BASE_URL="http://127.0.0.1:3425/v1"
```
