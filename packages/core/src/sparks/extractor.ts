import { existsSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, join, extname, basename, normalize } from "pathe";
import { tryit, unique, sift } from "radash";
import { SparkType } from "../schema.js";
import {
  SparkInputKind,
  UrlExtractionResult,
  LocalAssetResult,
  DistilledTextResult,
  DistillTextOptions,
} from "./types.js";
import {
  distillWithLLM,
} from "./llm.js";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
]);

/**
 * 第一性输入形态判定 (URL / 本地图片 / 本地文件 / 纯文本)
 */
export function detectInputKind(input: string): SparkInputKind {
  const trimmed = input.trim();

  // 1. URL 判定
  if (/^https?:\/\//i.test(trimmed)) {
    return "url";
  }

  // 2. 本地文件/图片存在性判定
  const [statErr, stats] = tryit(statSync)(trimmed);
  if (!statErr && stats?.isFile()) {
    const ext = extname(trimmed).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext) ? "image" : "file";
  }

  // 3. 后缀名命中且具备路径特征的图片输入（即便路径待创建）
  const ext = extname(trimmed).toLowerCase();
  if (
    IMAGE_EXTENSIONS.has(ext) &&
    (trimmed.includes("/") || trimmed.includes("\\") || trimmed.startsWith("."))
  ) {
    return "image";
  }

  // 4. 其它皆归为纯文本
  return "text";
}

/**
 * 极速轻量 URL 元数据提纯（无需重型 CDP/Readability，容错兜底保障）
 */
export async function extractUrlMetadata(
  rawUrl: string,
  fetchFn?: typeof fetch,
  timeoutMs: number = 1000
): Promise<UrlExtractionResult> {
  const trimmedUrl = rawUrl.trim();
  const [urlErr, parsedUrl] = tryit((u: string) => new URL(u))(trimmedUrl);
  const hostname = !urlErr && parsedUrl ? parsedUrl.hostname : "unknown";

  // 1. GitHub 仓库专用极速判定
  const githubMatch = trimmedUrl.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)/i
  );
  if (githubMatch) {
    const owner = githubMatch[1];
    const repo = githubMatch[2].replace(/\.git$/i, "");
    const defaultTitle = `${owner}/${repo}`;
    const defaultDesc = `GitHub 开源项目 ${owner}/${repo}`;
    const defaultTags = ["#GitHub", "#开源", "#工具"];

    // 尝试轻量快速抓取，超时自动降级兜底
    const fetcher = fetchFn ?? globalThis.fetch;
    const [fetchErr, resp] = await tryit(() =>
      fetcher(trimmedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Tachikoma-Sparks/1.0)" },
        signal: AbortSignal.timeout(timeoutMs),
      })
    )();

    if (!fetchErr && resp?.ok) {
      const [textErr, html] = await tryit(() => resp.text())();
      if (!textErr && html) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch =
          html.match(
            /<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']*)["']/i
          ) ||
          html.match(
            /<meta\s+content=["']([^"']*)["']\s+(?:name|property)=["'](?:description|og:description)["']/i
          );

        let cleanTitle = defaultTitle;
        if (titleMatch && titleMatch[1]) {
          cleanTitle =
            titleMatch[1]
              .replace(/^GitHub\s*-\s*/i, "")
              .replace(/\s*:\s*.*$/, "")
              .trim() || defaultTitle;
        }

        const cleanDesc =
          descMatch && descMatch[1] ? descMatch[1].trim() : defaultDesc;

        return {
          title: cleanTitle,
          description: cleanDesc,
          tags: defaultTags,
          isGithub: true,
          type: "tool",
          sourceUrl: trimmedUrl,
        };
      }
    }

    return {
      title: defaultTitle,
      description: defaultDesc,
      tags: defaultTags,
      isGithub: true,
      type: "tool",
      sourceUrl: trimmedUrl,
    };
  }

  // 2. 通用网页轻量提取
  let extractedTitle = hostname;
  let extractedDesc = trimmedUrl;
  let sparkType: SparkType = "fleeting";
  const tags: string[] = ["#网页", "#链接"];

  // 工具类域名或路径特征启发式嗅探
  if (/(tool|cli|api|dev|app|rust|python|docker|npm|crate)/i.test(trimmedUrl)) {
    sparkType = "tool";
    tags.push("#工具");
  }

  const fetcher = fetchFn ?? globalThis.fetch;
  const [fetchErr, resp] = await tryit(() =>
    fetcher(trimmedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Tachikoma-Sparks/1.0)" },
      signal: AbortSignal.timeout(timeoutMs),
    })
  )();

  if (!fetchErr && resp?.ok) {
    const [textErr, html] = await tryit(() => resp.text())();
    if (!textErr && html) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descMatch =
        html.match(
          /<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']*)["']/i
        ) ||
        html.match(
          /<meta\s+content=["']([^"']*)["']\s+(?:name|property)=["'](?:description|og:description)["']/i
        );

      if (titleMatch && titleMatch[1]) {
        extractedTitle = titleMatch[1].trim();
      }
      if (descMatch && descMatch[1]) {
        extractedDesc = descMatch[1].trim();
      }
    }
  }

  // 从 hostname 提炼一个主标签（如 x.com -> #x, juejin.cn -> #juejin）
  const domainTag = hostname.split(".")[0];
  if (domainTag && domainTag !== "www") {
    tags.push(`#${domainTag}`);
  }

  return {
    title: extractedTitle,
    description: extractedDesc,
    tags: unique(tags),
    isGithub: false,
    type: sparkType,
    sourceUrl: trimmedUrl,
  };
}

/**
 * 本地资产/梗图处理：复制至 assets 目录并规范化路径
 */
export async function processLocalAsset(
  filePath: string,
  assetsDir: string = ".sparks/assets"
): Promise<LocalAssetResult> {
  const normalizedSource = normalize(resolve(filePath));
  const [statErr, stats] = tryit(statSync)(normalizedSource);

  if (statErr || !stats?.isFile()) {
    throw new Error(`[Tachikoma Sparks] 本地资产文件不存在或无法读取: ${filePath}`);
  }

  const ext = extname(normalizedSource).toLowerCase();
  const isImg = IMAGE_EXTENSIONS.has(ext);
  const base = basename(normalizedSource);

  const targetDir = normalize(resolve(assetsDir));
  const [mkdirErr] = tryit(mkdirSync)(targetDir, { recursive: true });
  if (mkdirErr) {
    throw new Error(`[Tachikoma Sparks] 无法创建资产目录: ${targetDir}`);
  }

  const destPath = normalize(join(targetDir, base));

  // 若源文件与目标文件不在同一路径，执行复制
  if (normalizedSource !== destPath) {
    const [copyErr] = tryit(copyFileSync)(normalizedSource, destPath);
    if (copyErr) {
      throw new Error(`[Tachikoma Sparks] 资产复制失败: ${copyErr.message}`);
    }
  }

  return {
    assetPath: destPath,
    fileName: base,
    isImage: isImg,
  };
}

/**
 * 启发式一句话标题提取（兜底专用）
 */
export function fallbackExtractTitle(content: string): string {
  const attributionMatch = content.match(/——\s*([一-龥a-zA-Z0-9_\s]+)/m);
  const author = attributionMatch ? attributionMatch[1].trim() : null;

  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] ?? content;
  const cleanFirstLine = firstLine
    .replace(/^([#>*\-\s]+)/, "")
    .replace(/["“”]/g, "")
    .replace(/——.*$/, "")
    .trim();

  let title = cleanFirstLine.slice(0, 40);
  if (cleanFirstLine.length > 40) {
    title += "...";
  }

  if (author) {
    title = `${title} (出处: ${author})`;
  }

  return title || "未命名灵感";
}

/**
 * 极简优雅的离线/异常兜底提纯纯函数（绝不机械堆砌标签）
 */
export function fallbackDistillText(
  content: string,
  opts?: DistillTextOptions
): DistilledTextResult {
  const trimmed = content.trim();

  // 1. 提取文案中的 #标签 (纯函数声明式抽取，消灭 while exec 游标)
  const inTextTags = Array.from(
    trimmed.matchAll(/#([\p{L}\p{N}_-]+)/gu),
    (m) => `#${m[1]}`
  );

  // 2. 启发式自动分类判定
  let type: SparkType = opts?.userType ?? "fleeting";
  if (!opts?.userType) {
    if (
      /^(pnpm|npm|cargo|brew|docker|kubectl|git|curl|npx)\s/i.test(trimmed) ||
      /(github\.com|cli工具|开源项目|配置清单|代码片段)/i.test(trimmed)
    ) {
      type = "tool";
    } else if (
      /(段子|笑死|哈哈|神评|槽点|程序员段子|问：.*答：)/i.test(trimmed)
    ) {
      type = "joke";
    } else if (/(梗图|表情包|meme)/i.test(trimmed)) {
      type = "meme";
    } else if (
      /——\s*[一-龥a-zA-Z]/.test(trimmed) ||
      /["“”]/.test(trimmed) ||
      /(作用是|本质是|所谓|人生|世事|天道|顺应|命由|心之|修行的?|哲学|心智)/.test(
        trimmed
      ) ||
      /(诗|语录|名言|泰戈尔|鲁迅|苏轼|孟子|孔子|老子|庄子|王阳明|尼采|稻盛和夫|弘一法师|南怀瑾)/.test(
        trimmed
      )
    ) {
      type = "quote";
    } else {
      type = "fleeting";
    }
  }

  // 3. 极简克制的兜底标签（每个类别仅 1 个核心标签，绝不堆砌！）
  const defaultCategoryTag: Record<SparkType, string> = {
    quote: "#金句",
    joke: "#段子",
    tool: "#工具",
    meme: "#梗图",
    fleeting: "#闪念",
  };

  const userSpecifiedTags = opts?.tags ?? [];
  const candidateTags =
    inTextTags.length > 0 || userSpecifiedTags.length > 0
      ? [...userSpecifiedTags, ...inTextTags]
      : [defaultCategoryTag[type]];

  const finalTags = unique(sift(candidateTags)).slice(0, 3);
  const title = fallbackExtractTitle(trimmed);
  const cluster = opts?.cluster ?? (type === "tool" ? "arsenal" : undefined);

  return {
    title,
    type,
    tags: finalTags,
    content: trimmed,
    cluster,
  };
}

/**
 * 战术文本提纯入口：优先调用 LLM 语义提纯，异常或离线时极简优雅兜底
 */
export async function distillText(
  rawText: string,
  options?: SparkType | DistillTextOptions
): Promise<DistilledTextResult> {
  const content = rawText.trim();
  const opts: DistillTextOptions =
    typeof options === "string" ? { userType: options } : (options ?? {});

  // 1. 若未显式跳过 LLM，优先执行 LLM 语义提纯
  if (!opts.skipLlm) {
    const [llmErr, llmRes] = await tryit(distillWithLLM)(
      content,
      opts.llmOptions
    );

    if (!llmErr && llmRes) {
      const mergedTags = unique(
        sift([...(llmRes.tags || []), ...(opts.tags || [])])
      ).slice(0, 3);

      return {
        title:
          opts.userType && opts.userType !== llmRes.type
            ? fallbackExtractTitle(content)
            : llmRes.title,
        type: opts.userType ?? llmRes.type,
        cluster: opts.cluster ?? llmRes.cluster,
        tags: mergedTags.length > 0 ? mergedTags : ["#灵感"],
        content,
      };
    }
  }

  // 2. 离线、超时或异常时的极简优雅兜底
  return fallbackDistillText(content, opts);
}
