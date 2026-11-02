import { AuthorInfo, MediaType } from "@tachikoma/core";

export type DouyinExtractionSource =
  | "ssr"
  | "render-data"
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

export interface DouyinCollectionFolder {
  id: string;
  name: string;
  totalCount: number;
  coverUrl?: string;
}

export interface DouyinSyncOptions {
  profileDir?: string;
  cdpEndpoint?: string;
  outputDir: string;
  magpieBaseUrl?: string;
  magpieApiKey?: string;
  magpieModel?: string;
  downloadMedia?: boolean;
  sqlitePath?: string;
  dbPath?: string;
  collectId?: string;
  folderName?: string;
  customTransport?: (path: string, params?: Record<string, unknown>) => Promise<any>;
  customFetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  customOcr?: (images: string[]) => Promise<string>;
  customTranscribe?: (videoUrlOrPath: string) => Promise<string | undefined>;
  customExtractor?: (urlOrId: string) => Promise<DouyinAwemeItem>;
}
