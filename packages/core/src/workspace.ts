import { resolve, dirname } from "pathe";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { Static, Type } from "@sinclair/typebox";

export const TachikomaWorkspacePathsSchema = Type.Object({
  rootDir: Type.String(),
  sparksDbPath: Type.String(),
  sparksAssetsDir: Type.String(),
  defaultOutputDir: Type.String(),
  ghostRawDir: Type.String(),
});

export type TachikomaWorkspacePaths = Static<typeof TachikomaWorkspacePathsSchema>;

/**
 * 自适应解析 Tachikoma 根目录：
 * 1. 优先读取 TACHIKOMA_HOME 环境变量；
 * 2. 从 startDir 向上寻访包含 pnpm-workspace.yaml 的 monorepo 根目录；
 * 3. 兜底回退到用户主目录 ~/.tachikoma，杜绝在任意临时子目录中散落临时文件。
 */
export function resolveWorkspaceRoot(startDir: string = process.cwd()): string {
  if (process.env.TACHIKOMA_HOME && existsSync(process.env.TACHIKOMA_HOME)) {
    return resolve(process.env.TACHIKOMA_HOME);
  }

  const normalized = resolve(startDir).replace(/\\/g, "/");
  const ancestors = normalized
    .split("/")
    .map((_, idx, arr) => arr.slice(0, arr.length - idx).join("/") || "/")
    .filter((p, i, a) => a.indexOf(p) === i);

  return (
    ancestors.find((p) => existsSync(resolve(p, "pnpm-workspace.yaml"))) ??
    resolve(homedir(), ".tachikoma")
  );
}

/**
 * 自适应定位 Ghost 知识库只读不可变底座目录 (Ghost/_raw)：
 * 1. 优先读取环境变量 GHOST_RAW_DIR；
 * 2. 检查当前 workspace 内部的 Ghost/_raw；
 * 3. 检查 workspace 同级兄弟目录中的 Ghost/_raw (如 ~/Desktop/Ghost/_raw)；
 * 4. 兜底至 workspace 内部的 Ghost/_raw。
 */
export function resolveGhostRawDir(rootDir: string = resolveWorkspaceRoot()): string {
  if (process.env.GHOST_RAW_DIR && existsSync(process.env.GHOST_RAW_DIR)) {
    return resolve(process.env.GHOST_RAW_DIR);
  }

  const localRaw = resolve(rootDir, "Ghost/_raw");
  if (existsSync(localRaw)) {
    return localRaw;
  }

  const siblingRaw = resolve(dirname(rootDir), "Ghost/_raw");
  if (existsSync(siblingRaw)) {
    return siblingRaw;
  }

  return localRaw;
}

/**
 * 获取 Tachikoma 全局统一的工作空间资产与数据库锚定路径
 */
export function getTachikomaWorkspacePaths(options?: {
  customRoot?: string;
  customSparksDb?: string;
  customAssetsDir?: string;
  customOutput?: string;
}): TachikomaWorkspacePaths {
  const rootDir = options?.customRoot
    ? resolve(options.customRoot)
    : resolveWorkspaceRoot();

  const sparksDbPath = options?.customSparksDb
    ? resolve(rootDir, options.customSparksDb)
    : process.env.TACHIKOMA_SPARKS_DB
      ? resolve(process.env.TACHIKOMA_SPARKS_DB)
      : resolve(rootDir, ".sparks/sparks.db");

  const sparksAssetsDir = options?.customAssetsDir
    ? resolve(rootDir, options.customAssetsDir)
    : process.env.TACHIKOMA_ASSETS_DIR
      ? resolve(process.env.TACHIKOMA_ASSETS_DIR)
      : resolve(rootDir, ".sparks/assets");

  const defaultOutputDir = options?.customOutput
    ? resolve(rootDir, options.customOutput)
    : resolve(rootDir, "output");

  const ghostRawDir = options?.customOutput
    ? resolve(rootDir, options.customOutput)
    : resolveGhostRawDir(rootDir);

  return {
    rootDir,
    sparksDbPath,
    sparksAssetsDir,
    defaultOutputDir,
    ghostRawDir,
  };
}

export const getTachikomaDataPaths = getTachikomaWorkspacePaths;

