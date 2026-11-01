import {
  SparkRecord,
  SparkType,
  SparkStatus,
  SPARK_CORE_CLUSTERS,
  type SparkCoreCluster,
  type SparkCluster,
} from "../schema.js";
import { RFC2026Frontmatter } from "../types.js";

export { SPARK_CORE_CLUSTERS };
export type { SparkCoreCluster, SparkCluster };

/**
 * Tachikoma 战术灵感核心 MOC 领域定义（4+1 架构兼容别名）
 */
export const GHOST_CLUSTERS = SPARK_CORE_CLUSTERS;
export type GhostCluster = SparkCluster;

/**
 * 灵感输入形态类型
 */
export type SparkInputKind = "url" | "image" | "file" | "text";

/**
 * 轻量 LLM 提纯配置项
 */
export interface SparkLLMOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  customFetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

/**
 * LLM 语义提纯返回契约
 */
export interface SparkLLMResult {
  title: string;
  type: SparkType;
  cluster: SparkCluster;
  tags: string[];
}

/**
 * 文本提纯配置选项
 */
export interface DistillTextOptions {
  userType?: SparkType;
  cluster?: string;
  tags?: string[];
  llmOptions?: SparkLLMOptions;
  skipLlm?: boolean;
}

/**
 * 灵感提纯与录入选项
 */
export interface RefineSparkOptions {
  type?: SparkType;
  title?: string;
  tags?: string[];
  cluster?: string;
  assetsDir?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  llmOptions?: SparkLLMOptions;
  skipLlm?: boolean;
  imageTranscriber?: (dataUrl: string) => Promise<string>;
}

/**
 * URL 极速轻量解析提取结果
 */
export interface UrlExtractionResult {
  title: string;
  description: string;
  tags: string[];
  isGithub: boolean;
  type: SparkType;
  sourceUrl: string;
}

/**
 * 本地资产文件处理结果
 */
export interface LocalAssetResult {
  assetPath: string;
  fileName: string;
  isImage: boolean;
}

/**
 * 文本提纯结果
 */
export interface DistilledTextResult {
  title: string;
  type: SparkType;
  tags: string[];
  content: string;
  cluster?: string;
}

/**
 * 灵感升格 Ghost 选项
 */
export interface PromoteSparkOptions {
  outputDir?: string;
  category?: string;
}

/**
 * 灵感升格 Ghost 结果
 */
export interface PromoteSparkResult {
  spark: SparkRecord;
  filePath: string;
  sha256: string;
  frontmatter: RFC2026Frontmatter;
}

