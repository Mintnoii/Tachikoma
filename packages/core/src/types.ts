import { Static, Type } from "@sinclair/typebox";

/**
 * 摄入物理渠道类型
 */
export type EntryType =
  | "wechat-clipper"
  | "twitter-clipper"
  | "douyin-sync"
  | "manual-research"
  | "manual-notes"
  | "ai-conversation";

/**
 * 摄入媒体类型
 */
export type MediaType = "article" | "tweet" | "video" | "gallery";

/**
 * 作者元数据
 */
export interface AuthorInfo {
  name: string;
  id?: string;
  url?: string;
  avatar?: string;
}

/**
 * RFC-2026-0922 标准 Frontmatter 结构
 */
export interface RFC2026Frontmatter {
  title: string;
  entry: EntryType;
  media_type: MediaType;
  source_url: string;
  created_at: string;
  tags: string[];
  author?: AuthorInfo;
  sha256?: string;
  extra?: Record<string, unknown>;
}

/**
 * 统一多模态情报摄入输出对象 (Universal Ingestion Result)
 */
export interface IngestionResult {
  sourceUrl: string;
  entry?: EntryType; // 可选显式指定；省略时由 formatter 根据 sourceUrl/mediaType 自动推断
  mediaType: MediaType;
  title: string;
  author: AuthorInfo;
  content: string; // 标准 Markdown 正文 / OCR 文本 / 转录文本
  rawAssets?: string[]; // 本地图片/音视频持久化路径
  metadata: Record<string, unknown>;
  createdAt: string;
  sha256?: string;
}

/**
 * 摄入配置
 */
export interface TachikomaConfig {
  outputDir: string; // 摄入落盘根目录 (例如隔离沙盒目录或 Ghost/_raw/)
  cdpEndpoint?: string; // CDP 连接端点 (如 http://127.0.0.1:9222)
  cookiesPath?: string; // 抖音/推文 Cookies 凭据路径
  downloadMedia?: boolean; // 是否持久化多媒体资源
}

export type {
  SparkType,
  SparkStatus,
  SparkRecord,
  CreateSparkInput,
  UpdateSparkInput,
} from "./schema.js";

