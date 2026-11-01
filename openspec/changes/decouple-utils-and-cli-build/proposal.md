# Proposal: 消除跨仓隐式依赖与 CLI 构建打包体系闭环

- **Name**: `decouple-utils-and-cli-build`
- **Date**: 2026-11-01
- **Status**: Proposed
- **Author**: qing & Pi (Coordinator)
- **Target Issues**:
  - Issue 1: 跨仓库隐式依赖 `@dotagents/utils`，换机编译失败（`packages/core/src/formatter.ts`、`apps/douyin-sync` 等共 6 处依赖 `../dotagents/utils/*`）；
  - Issue 3: 没有 build 流程，CLI 装不出入口（`apps/cli/package.json` 指向 `./dist/cli.js` 但无构建脚本与 dist 产物）；
  - Issue 5 (附带): `packages/guard` 空壳评估与治理，全仓构建/类型检查/测试体系彻底自包含收敛。

---

## 1. 为什么做（Why）

### 1.1 问题 1：跨仓库隐式依赖的脆弱性
- 目前 Tachikoma 的 `tsconfig.json` paths 指向 `../dotagents/utils/*`，直接引用了上级目录的源码；
- 实际上所用到的功能极度单一轻量：
  - `toPosixPath(p)`: 本质就是 `pathe.normalize(p)`；
  - `computeContentHash(content)`: 本质就是标准的 Node.js `crypto.createHash('sha256').update(content).digest('hex')`；
  - `readMarkdownFile(path)` (测试中用到): 本质就是 `fs.readFileSync` + `gray-matter`；
- 这种隐式跨仓软连接破坏了 Monorepo 的自包含契约，换一台机器或在独立 CI/Docker 镜像中克隆 Tachikoma 会直接报模块不存在。必须将这些微型通用工具内生化为 `@tachikoma/core/src/utils/`。

### 1.2 问题 3：没有 build 构建管道，CLI 无法打包与全局安装
- `apps/cli/package.json` 中配置了：
  ```json
  "bin": {
    "tachikoma": "./dist/cli.js",
    "tachikoma-dev": "./src/cli.ts"
  }
  ```
- 但根目录和子包均无 `build` 脚本，没有通过 `tsup` 或 `unbuild` 生成产物，导致除了 `node --import tsx` 裸跑源码外，无法通过 `pnpm build` 生成独立的二进制/Node 执行入口，也无法通过 `npm link` / `pnpm link -g` 真正作为全局命令行使用。

---

## 2. 改什么（What）

1. **模块内生化 (自包含契约)**：
   - 在 `packages/core/src/utils/` 建立 `path.ts`、`hash.ts`、`markdown.ts`；
   - 替换所有对 `@dotagents/utils/*` 的引用，改为引用 `@tachikoma/core` 内部工具；
   - 清理 `tsconfig.json` 中的 `@dotagents/utils` paths 声明，切断跨仓硬绑。
2. **构建打包体系 (tsup / unbuild 极速构建)**：
   - 引入高效的 TypeScript 打包工具（如 `tsup`），为 `apps/cli` 配置构建脚本，生成带 `#!/usr/bin/env node` Shebang 的单文件 ESM 产物 `apps/cli/dist/cli.js`；
   - 在根目录 `package.json` 中添加统一 `"build": "pnpm --filter @tachikoma/cli build"`。
3. **空壳与构建验证**：
   - 运行 `pnpm build`，验证 `apps/cli/dist/cli.js` 正常生成并可用 `node apps/cli/dist/cli.js --help` 正常执行；
   - 运行全量 `pnpm typecheck` 与 `pnpm test`，确保 100% 绿色通过。
