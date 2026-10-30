import { MediaType } from "@tachikoma/core";

export interface WebClipperOptions {
  outputDir: string;
  cdpEndpoint?: string;
  headless?: boolean;
  timeoutMs?: number;
  customFetcher?: (url: string) => Promise<{ html: string; finalUrl: string }>;
}

export interface PurifiedArticle {
  title: string;
  byline?: string;
  content: string; // Markdown 格式纯净正文
  excerpt?: string;
  siteName?: string;
  lang?: string;
  mediaType: MediaType;
}

export interface MetaDescriptionResult {
  content: string;
  author?: string;
  ogImage?: string;
}
