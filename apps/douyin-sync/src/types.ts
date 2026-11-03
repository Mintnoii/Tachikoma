import { AuthorInfo, MediaType } from "@tachikoma/core";

export type DouyinExtractionSource =
  | "ssr"
  | "in-page-xhr"
  | "dom"
  | "authed-session";

export type DouyinExtractionConfidence =
  | "high"
  | "dom-fallback"
  | "authed-session";

export interface DouyinAuthor {
  uid: string;
  secUid: string;
  nickname: string;
  avatarUrl?: string;
}

export interface DouyinAwemeItem {
  id: string; // aweme_id
  desc: string;
  author: DouyinAuthor;
  createTime: number; // unix timestamp seconds
  mediaType: MediaType; // "video" | "gallery"
  videoPlayUrl?: string;
  /** 播放地址全集（CDN 多线路备份，按序尝试） */
  videoUrlList?: string[];
  imageUrls?: string[];
  shareUrl: string;
  statistics?: {
    diggCount?: number;
    commentCount?: number;
    collectCount?: number;
    shareCount?: number;
  };
  raw?: Record<string, unknown>;
  source?: DouyinExtractionSource;
  confidence?: DouyinExtractionConfidence;
}

export interface DouyinAuthorRule {
  sec_uid: string;
  nickname?: string;
  max_count?: number;
}

export interface DouyinMixRule {
  mix_id: string;
  name?: string;
  max_count?: number;
}

export interface SyncRulesConfig {
  collections?: string[];
  nameKeywords?: string[];
  maxPerFolder?: number;
  authors?: DouyinAuthorRule[];
  mixes?: DouyinMixRule[];
}

export type CollectFilterRules = SyncRulesConfig;

export interface DouyinCollectionFolder {
  id: string;
  name: string;
  totalCount: number;
  coverUrl?: string;
}

export interface DouyinSyncOptions {
  profileDir?: string;
  outputDir: string;
  magpieBaseUrl?: string;
  magpieApiKey?: string;
  magpieModel?: string;
  downloadMedia?: boolean;
  sqlitePath?: string;
  dbPath?: string;
  collectId?: string;
  folderName?: string;
  filterRules?: SyncRulesConfig;
  rulesConfigPath?: string;
  authorSecUid?: string;
  authorNickname?: string;
  mixId?: string;
  mixName?: string;
  maxCount?: number;
  authors?: DouyinAuthorRule[];
  mixes?: DouyinMixRule[];
  customTransport?: (path: string, params?: Record<string, unknown>) => Promise<any>;
  customFetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  customOcr?: (images: string[]) => Promise<string>;
  customTranscribe?: (videoUrlOrPath: string) => Promise<string | undefined>;
  customExtractor?: (urlOrId: string) => Promise<DouyinAwemeItem>;
}
