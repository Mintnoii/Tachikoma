# Tachikoma（塔奇克马）

> 攻壳机动队敏捷情报战车 —— 多模态内容摄入引擎，将网页长文、抖音视频与灵感碎片统一收归本地知识库。

## 功能概览

- **网页 / 推文剪藏**：`tachikoma capture <URL>` —— 提纯正文，落盘为标准 Markdown
- **抖音三轨增量同步**：`tachikoma sync` —— 收藏夹、创作者主页与合集专栏，图文 OCR + 语音转录，断点续传
- **战术灵感碎片流**：`tachikoma spark` —— 毫秒级落盘本地 SQLite，支持后续语义提纯与升格

## 架构

```text
Tachikoma/ (pnpm Monorepo)
├── apps/
│   ├── cli/          # 统一命令行门面（capture / sync / spark）
│   ├── douyin-sync/  # 抖音三轨增量对账、OCR、ASR 语音转录
│   └── web-clipper/  # CDP / Readability 网页推文 DOM 提纯
├── packages/
│   ├── core/         # 契约、TypeBox Schema、RFC-2026-0922 格式化器、Sparks SQLite 引擎
│   └── guard/        # Rust 无黑框后台守护进程（夜间自动调度同步）
└── services/
    └── asr/          # 本地 whisper.cpp ASR Sidecar（OpenAI Audio 兼容接口）
```

## 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | >= 20 | 运行 TS 核心与 CLI |
| pnpm | >= 9 | 包管理器，严禁 npm / yarn |
| Rust + Cargo | stable | 编译 `packages/guard` 守护进程 |
| Windows 10/11 | — | Guard 为 Windows 专属；CLI / web-clipper 跨平台 |
| ffmpeg | 任意版本 | 视频转录前的音频预处理（`ffmpeg` 需在 PATH，或通过 `TACHIKOMA_FFMPEG_BIN` 指定路径） |
| NVIDIA GPU | 可选 | 本地 ASR 推理加速（无 GPU 自动降级 CPU 模式，速度较慢） |

**本地 ASR（可选，抖音视频转录用）：**
- 下载 [whisper.cpp](https://github.com/ggml-org/whisper.cpp) Windows 预编译包，解压至 `services/asr/bin/`
- 下载 ggml 模型权重（如 `ggml-medium.bin`）至 `services/asr/models/`
- 详细步骤见 [`services/asr/README.md`](services/asr/README.md)
- 不安装 ASR 时抖音视频只抓文字内容，不影响其他功能

## 安装

```bash
git clone https://github.com/your-username/tachikoma.git
cd tachikoma
pnpm install
pnpm build
```

## 配置

通过环境变量或 `.env` 文件控制关键路径（无需修改代码）：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `TACHIKOMA_HOME` | 项目根目录（优先于自动探测） | 自动向上寻访 `pnpm-workspace.yaml` |
| `GHOST_RAW_DIR` | 摄入结果落盘目录 | 自动探测同级 `<知识库>/_raw/`，兜底至 `output/` |
| `TACHIKOMA_SPARKS_DB` | Sparks 灵感数据库路径 | `<root>/.sparks/sparks.db` |
| `TACHIKOMA_SYNC_WINDOW_START` | 夜间调度窗口开始小时 | `2`（凌晨 02:00） |
| `TACHIKOMA_SYNC_WINDOW_END` | 夜间调度窗口结束小时 | `8`（上午 08:00） |

**抖音同步规则**配置见 `apps/douyin-sync/config/sync_rules.yaml`（收藏夹名称、作者主页、合集专栏白名单）。

> ⚠️ 抖音登录态存储于 `.secrets/douyin-profile/`，已加入 `.gitignore`，永不提交版本库。首次使用需执行 `tachikoma sync --login` 完成浏览器登录授权。

## 快速上手

```bash
# 剪藏一篇网页文章
tachikoma capture https://example.com/article

# 灵感碎片随手记
tachikoma spark add "今天想到一个点..."

# 抖音收藏夹增量同步（首次需登录）
tachikoma sync --login   # 仅首次
tachikoma sync           # 后续增量

# 查看 Sparks 灵感库
tachikoma spark list
```

## 后台服务管理

Rust Guard 守护进程负责夜间自动调度同步与 ASR Sidecar 拉起，默认在凌晨 02:00 ~ 08:00 活跃：

```bash
pnpm svc:status          # 查看 Guard 与 Whisper 状态
pnpm svc:start           # 启动后台守护
pnpm svc:stop            # 关闭全部后台服务
pnpm svc:restart         # 重启
pnpm svc:autostart:on    # 注册 Windows 开机自启
pnpm svc:autostart:off   # 取消开机自启
```

## 核心设计取舍

**不落盘视频文件**：内存流式抽取音频转录，不保存 `.mp4`，避免存储膨胀。

**不在摄入期调 LLM 增强**：摄入结果保留原声底座（原始 OCR 文本 / ASR 转录稿），语义提纯交由下游知识库流水线按需处理，`_raw/` 底座 100% 只读不可变。

**不可变路径绑定**：抖音合集专栏的落盘目录 100% 绑定本地配置中的 `mix.name`，对远程博主改名绝对免疫。

**专栏权威优先制（Mixes > Authors > Collections）**：消灭同一视频被手动加收藏后在本地重复落盘的问题。

## License

MIT
