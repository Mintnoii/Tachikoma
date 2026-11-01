# Design: 工作区路径锚定与 TypeScript 原生 ASR 音频转录管线

## 1. 架构与设计原则

遵循 Tachikoma 核心规约与审美门禁：
1. **工具库优先**：路径处理依托 `pathe`，异步解构依托 `radash.tryit`，强类型契约依托 `@sinclair/typebox`；
2. **拒绝旧 Python 脚本与复杂胶水**：使用现代 TypeScript + Node.js 原生 HTTP / fetch，以标准 OpenAI Audio Transcription API 格式请求本地或远端 ASR 服务；
3. **零副作用与目录隔离**：通过自适应向上寻访找到真正的 Tachikoma 项目根目录或用户统一数据目录，彻底杜绝在执行命令的任意 CWD 目录下散落 `.sparks/` 临时文件夹。

---

## 2. 详细设计

### 2.1 模块 1：工作区与持久化路径定位器 (`packages/core/src/workspace.ts`)

```typescript
import { resolve, dirname } from "pathe";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

export interface WorkspacePaths {
  rootDir: string;
  sparksDbPath: string;
  sparksAssetsDir: string;
  defaultOutputDir: string;
}

export function resolveWorkspaceRoot(startDir: string = process.cwd()): string {
  // 1. 环境变量优先
  if (process.env.TACHIKOMA_HOME && existsSync(process.env.TACHIKOMA_HOME)) {
    return resolve(process.env.TACHIKOMA_HOME);
  }

  // 2. 向上寻访标志文件 (pnpm-workspace.yaml / package.json with name 'tachikoma')
  let current = resolve(startDir);
  while (true) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 3. 兜底至用户全局数据目录 ~/.tachikoma
  return resolve(homedir(), ".tachikoma");
}
```

### 2.2 模块 2：TypeScript 原生 ASR 客户端 (`apps/douyin-sync/src/asr.ts`)

设计轻量无依赖的 ASR 客户端：
- **协议契约**：遵循 `POST ${baseUrl}/audio/transcriptions` 标准规范；
- **传输格式**：Node 18+ 原生 `FormData` + `Blob` / `fs.openAsBlob` 或 `Buffer`，发送 `file`, `model` (默认 `whisper-1` 或本地模型名称), `language` (默认 `zh`), `response_format` (默认 `json` / `text`)；
- **配置注入**：
  - `TACHIKOMA_ASR_BASE_URL`（默认支持 `http://127.0.0.1:3425/v1` 或 `http://127.0.0.1:8000/v1` 或 OpenAI 标准兼容端点）；
  - `TACHIKOMA_ASR_MODEL`（默认 `whisper-1`）；
  - `TACHIKOMA_ASR_API_KEY`；
- **平滑降级机制**：
  - 遇到网络异常、服务未开启、文件不支持或超时（默认 30s），通过 `radash.tryit` 捕获并记录 warning，自动降级返回空或 fallback 到文案，不崩断整个视频抓取管道。

### 2.3 模块 3：CLI 与 Pipeline 端到端接线

- 在 `apps/cli/src/cli.ts` 的 `tachikoma sync douyin` 命令中：
  - 初始化 `createAudioTranscriber()`；
  - 传入 `runDouyinSyncPipeline` 的 `customTranscribe`；
- 在 `apps/cli/src/sparks-cli.ts` 与 `apps/cli/src/cli.ts` 中：
  - 替换所有的裸 `resolve(process.cwd(), ...)` 为 `getTachikomaWorkspacePaths()` 提供的锚定路径。
