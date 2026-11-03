# 任务清单

## 1. 前置修复（已完成）

- [x] 1.1 `downloadAsset` 与 ASR 下载补抖音 CDN 防盗链头（`User-Agent` + `Referer` + `Range`），抽出 `src/cdn.ts` 统一常量
- [x] 1.2 视频下载改为多 CDN 线路按序尝试（`videoUrlList` ← `play_addr.url_list` ∪ `play_addr_h264.url_list`）
- [x] 1.3 实测：`下载音视频源失败: HTTP 403` 消失，转写失败原因转为 `404 model not found`

## 2. 本地 ASR 服务

- [x] 2.1 新建 `services/asr/server.py`：FastAPI/uvicorn，实现 `POST /v1/audio/transcriptions`（multipart 契约见 design §2）
- [x] 2.2 `GET /healthz` 返回 `{status, model, device, loaded}`；`?load=1` 触发预加载
- [x] 2.3 懒加载 `faster-whisper`，设备/精度支持 `ASR_DEVICE` / `ASR_COMPUTE_TYPE` 覆盖，CUDA 缺失自动回退 CPU int8
- [x] 2.4 `model` 字段解析为本地尺寸（`whisper-medium` / `medium` → `medium`），非法值回退环境默认
- [x] 2.5 `services/asr/requirements.txt`（`faster-whisper>=1.1.0`, `fastapi`, `uvicorn[standard]`, `python-multipart`）
- [x] 2.6 `services/asr/start.ps1` + `README.md`（创建 venv、安装、启动、探活、排障）
- [x] 2.7 推理期 CUDA 兜底：`cublas64_12.dll` 缺失只在首次 `transcribe` 时炸，`get_cuda_device_count()` 探测不到；改为捕获后重载 CPU 并重试一次
- [x] 2.8 ASR 服务并入 Rust 守护进程 `packages/guard`：启动即拉起、10s TCP 探活、退出自愈重启，淘汰手动 `start.ps1`

## 2b. 技术栈修正：Python Sidecar → whisper.cpp 二进制（2026-11-03 改判）

- [x] 2b.1 推翻 Python 实现（`server.py` / `requirements.txt` / `start.ps1` / `.venv`），理由：违反 TS + Rust 栈，反向引入胶水运行时
- [x] 2b.2 `packages/guard` 改为拉起 `bin/whisper-server.exe`，参数 `--inference-path /v1/audio/transcriptions`（原生 OpenAI 协议）
- [x] 2b.3 `.gitignore` 排除 `services/asr/bin/` 与 `services/asr/models/`
- [x] 2b.4 README 改写为「零解释器二进制」形态，含官方预编译包与 ggml 模型下载命令
- [x] 2b.5 实机验证：CUDA 版 whisper-server 在 8000 端口响应 `/v1/audio/transcriptions`，`prompt` 词表生效，真实抖音摄入出转录段落
- [x] 2b.6 物理删除 Python 残留（`server.py` / `requirements.txt` / `start.ps1` / `.venv` 2.3G）
- [x] 2b.7 whisper-server 只收 WAV：TS 侧新增 `src/media.ts` 用 ffmpeg 转 16k 单声道 WAV，ffmpeg 缺失时降级不中断

## 3. TS 侧接线

- [x] 3.1 `asr.ts` 默认 `baseUrl` 改为 `http://127.0.0.1:8000/v1`
- [x] 3.2 `asr.ts` 新增 `prompt` 表单字段，来源 `config/asr_glossary.yaml` 的 `verified` 词条，上限 64 条
- [x] 3.3 词表读取/解析失败静默降级为空 prompt，不影响转写主流程
- [x] 3.4 错误信息保留 HTTP 状态 + body 前 200 字符（现有行为，勿回退）
- [x] 3.5 超时拆分：下载 `TACHIKOMA_ASR_DOWNLOAD_TIMEOUT_MS`（默认 60s）与推理 `TACHIKOMA_ASR_TIMEOUT_MS`（默认 600s），CPU 慢路径不再被 30s 误杀
- [x] 3.6 默认模型名由 `whisper-1` 改为 `whisper-medium`，与服务端尺寸映射对齐

## 4. 验证（2026-11-03 实测完成）

- [x] 4.1 `pnpm typecheck` 零新增错误
- [x] 4.2 `pnpm test` 全绿，新增单测覆盖：词表 → prompt 拼接（含 64 条上限、verified 过滤）、model 名字映射
- [x] 4.3 服务端 `curl` 冒烟：`/healthz` 通 + 一段本地 mp3 转写返回非空 `text`
- [x] 4.4 Tachikoma 真实摄入一次抖音视频，输出中不再出现 `[Tachikoma ASR] 语音转录跳过/降级`

## 5. 文档

- [x] 5.1 `services/asr/README.md` 写明：模型来源、端口、环境变量、与 Magpie/云端 ASR 的切换方式
- [x] 5.2 记录本次归因链条（Python 进程内 → TS HTTP 客户端缺服务端 → 词表丢失）

## 实测结论（2026-11-03）

- 本机有 NVIDIA 驱动但 **cuBLAS 运行时不全**（`cublas64_12.dll` 缺失）：CUDA 建模成功、推理即炸。现行默认走 CPU int8，medium 处理约 2 分钟视频需 2-3 分钟。
- 首次真实转录暴露的错词（Zig / Lightpanda / Puppeteer / PandaScript）已回填 `asr_glossary.yaml`，供后续解码纠偏。
- 失败栈演进：`403`（防盗链）→ `404 model not found`（端点错配）→ `500 cublas`（设备误判）→ `timeout`（30s 太短）→ **成功**。
- 真实产出：sparks 正文新增 `🎙️ 音频转录:` 段，与原有文案要点并存。
