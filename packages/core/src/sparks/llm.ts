import { tryit, unique, sift } from "radash";
import { safeJsonParse } from "../utils/json.js";
import {
  SparkType,
  SPARK_CORE_CLUSTERS,
  type SparkCoreCluster,
  type SparkCluster,
} from "../schema.js";
import {
  SparkLLMOptions,
  SparkLLMResult,
} from "./types.js";

export const SPARK_CORE_CLUSTER_SET = new Set<string>(SPARK_CORE_CLUSTERS);
export const GHOST_CLUSTER_SET = SPARK_CORE_CLUSTER_SET;

const VALID_SPARK_TYPES = new Set<SparkType>([
  "quote",
  "tool",
  "joke",
  "meme",
  "fleeting",
]);

/**
 * 规范化归属的核心战术领域至 Tachikoma 6+1 核心领域之一
 * - soul: 灵魂避难所 (哲学心性/修心/内心宁静/命运思考)
 * - literature: 文墨与回响 (唯美句子/文艺文案/诗意/浪漫/电影台词)
 * - life: 日常与烟火 (生活方式/美食咖啡/家居器物/宠物/松弛感日常)
 * - arsenal: 赛博军械库 (开源项目/CLI工具/黑科技)
 * - meme: 赛博解构槽 (梗图/搞笑段子/幽默吐槽)
 * - sparks: 思维火花 (灵感洞察/产品巧思/商业直觉)
 * - custom/<slug>: 涌现主题簇
 */
export function normalizeSparkCluster(rawCluster?: string): SparkCluster {
  if (!rawCluster) return "sparks";
  const cleaned = rawCluster.trim().toLowerCase();
  if (SPARK_CORE_CLUSTER_SET.has(cleaned)) {
    return cleaned as SparkCoreCluster;
  }
  if (cleaned.startsWith("custom/")) {
    return cleaned;
  }

  // 1. soul (灵魂避难所 / 哲学心性 / 修心 / 内心宁静 / 命运思考)
  if (
    cleaned === "psychology" ||
    cleaned.includes("soul") ||
    cleaned.includes("psycho") ||
    cleaned.includes("zen") ||
    cleaned.includes("mind") ||
    cleaned.includes("心理") ||
    cleaned.includes("修行") ||
    cleaned.includes("修心") ||
    cleaned.includes("心性") ||
    cleaned.includes("命运") ||
    cleaned.includes("禅") ||
    cleaned.includes("宁静") ||
    cleaned.includes("平静") ||
    cleaned.includes("灵魂") ||
    cleaned.includes("避难")
  ) {
    return "soul";
  }

  // 2. literature (文墨与回响 / 唯美句子 / 文艺文案 / 诗意 / 浪漫 / 电影台词)
  if (
    cleaned.includes("literature") ||
    cleaned.includes("literary") ||
    cleaned.includes("poem") ||
    cleaned.includes("poetry") ||
    cleaned.includes("echo") ||
    cleaned.includes("文学") ||
    cleaned.includes("文墨") ||
    cleaned.includes("回响") ||
    cleaned.includes("唯美") ||
    cleaned.includes("文艺") ||
    cleaned.includes("文案") ||
    cleaned.includes("诗意") ||
    cleaned.includes("诗词") ||
    cleaned.includes("诗歌") ||
    cleaned.includes("浪漫") ||
    cleaned.includes("台词")
  ) {
    return "literature";
  }

  // 3. life (日常与烟火 / 生活方式 / 美食咖啡 / 家居器物 / 宠物 / 松弛感日常)
  if (
    cleaned.includes("life") ||
    cleaned.includes("coffee") ||
    cleaned.includes("lifestyle") ||
    cleaned.includes("日常") ||
    cleaned.includes("烟火") ||
    cleaned.includes("生活") ||
    cleaned.includes("美食") ||
    cleaned.includes("咖啡") ||
    cleaned.includes("家居") ||
    cleaned.includes("器物") ||
    cleaned.includes("宠物") ||
    cleaned.includes("松弛")
  ) {
    return "life";
  }

  // 4. arsenal (赛博军械库 / 战术装备 / 神兵利器 / CLI黑科技 / 开源库)
  if (
    cleaned === "tools" ||
    cleaned === "tool" ||
    cleaned.includes("arsenal") ||
    cleaned.includes("util") ||
    cleaned.includes("cli") ||
    cleaned.includes("code") ||
    cleaned.includes("工具") ||
    cleaned.includes("利器") ||
    cleaned.includes("装备") ||
    cleaned.includes("军械") ||
    cleaned.includes("开源")
  ) {
    return "arsenal";
  }

  // 5. meme (赛博解构槽 / 梗图 / 段子 / 幽默吐槽 / 表情包)
  if (
    cleaned.includes("meme") ||
    cleaned.includes("joke") ||
    cleaned.includes("梗") ||
    cleaned.includes("段子") ||
    cleaned.includes("吐槽") ||
    cleaned.includes("表情包") ||
    cleaned.includes("幽默")
  ) {
    return "meme";
  }

  // 6. sparks (思维火花 / 灵感洞察 / 产品巧思 / 商业直觉)
  if (
    cleaned === "cognition" ||
    cleaned === "finance" ||
    cleaned === "interview" ||
    cleaned === "social-science" ||
    cleaned === "relationship" ||
    cleaned === "travel" ||
    cleaned.includes("spark") ||
    cleaned.includes("think") ||
    cleaned.includes("cognit") ||
    cleaned.includes("认知") ||
    cleaned.includes("哲学") ||
    cleaned.includes("火花") ||
    cleaned.includes("灵感") ||
    cleaned.includes("洞察") ||
    cleaned.includes("巧思") ||
    cleaned.includes("随笔") ||
    cleaned.includes("商业") ||
    cleaned.includes("直觉")
  ) {
    return "sparks";
  }

  return "sparks";
}

export const normalizeGhostCluster = normalizeSparkCluster;

/**
 * 规范化灵感正交类别
 */
export function normalizeSparkType(rawType?: string): SparkType {
  if (rawType && VALID_SPARK_TYPES.has(rawType.toLowerCase() as SparkType)) {
    return rawType.toLowerCase() as SparkType;
  }
  return "fleeting";
}

/**
 * 规范化标签：极度克制，确保以 # 开头并严格限制在 2~3 个最具穿透力的高维标签
 */
export function normalizeSparkTags(rawTags?: unknown[]): string[] {
  if (!Array.isArray(rawTags)) return [];
  const cleaned = sift(
    rawTags.map((t) => (typeof t === "string" ? t.trim() : ""))
  );
  const normalized = cleaned
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
  return unique(normalized).slice(0, 3);
}

/**
 * 清洗大模型输出的 JSON 字符串（剥离 markdown 代码块标记与杂质）
 */
export function cleanJsonOutput(raw: string): string {
  const trimmed = raw.trim();
  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  const jsonMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  return trimmed;
}

/**
 * Tachikoma 战术军械库 6+1 MOC 体系对齐的战术灵感提纯系统提示词
 */
export const SPARK_DISTILL_SYSTEM_PROMPT = `你是一个 Tachikoma 战术军械库与灵感提纯专家。
将用户输入的碎片灵感、金句、工具或随笔提纯为结构化 JSON 格式，严格符合以下契约：
{
  "title": "精炼的一句话标题（不超过 30 字，若有原作者或出处可在末尾注明，如「... —— 某某」）",
  "type": "正交类别，必须严格为以下 5 种之一: quote | tool | joke | meme | fleeting",
  "cluster": "归属的核心战术领域，必须严格在以下 6 大核心领域中精准单选: soul | literature | life | arsenal | meme | sparks",
  "tags": ["#高维标签1", "#高维标签2"]
}

【核心战术领域 (Sparks MOCs 6+1) 映射指南】
- soul: 灵魂避难所 / 哲学心性 / 修心 / 内心宁静 / 命运思考 / 心理自洽（高维标签推荐: #修行、#内心平静、#心性、#命运思考）
- literature: 文墨与回响 / 唯美句子 / 文艺文案 / 诗意 / 浪漫 / 电影台词 / 小说金句（高维标签推荐: #唯美句子、#文艺、#诗意、#浪漫、#电影台词）
- life: 日常与烟火 / 生活方式 / 美食咖啡 / 家居器物 / 宠物 / 松弛感日常 / 市井烟火（高维标签推荐: #生活方式、#手冲咖啡、#日常、#松弛感）
- arsenal: 赛博军械库 / 战术装备 / 神兵利器 / CLI黑科技 / 开源库 / 生产力开发工具（高维标签推荐: #CLI、#Rust、#开发利器、#开源工具）
- meme: 赛博解构槽 / 梗图 / 段子 / 幽默吐槽 / 表情包 / 荒诞讽刺（高维标签推荐: #段子、#梗图、#幽默吐槽）
- sparks: 思维火花 / 灵感洞察 / 产品巧思 / 商业直觉 / 底层逻辑 / 元认知随想（高维标签推荐: #认知、#思考、#思维模型、#灵感、#商业直觉）

【极度克制提纯守则】
1. tags 严格限制在 2~3 个最具穿透力的高维标签（如 ["#修行", "#内心平静"] 或 ["#唯美句子", "#浪漫"] 或 ["#CLI", "#Rust"]），严禁无脑分词、碎词堆砌！每个标签必须以 # 开头。
2. cluster 必须严格单选 soul / literature / life / arsenal / meme / sparks 之一，严禁输出任何已废弃的 Ghost 学科分类（如 psychology/finance/interview/cognition/tools 等）。
3. type 类别必须正交：名言/警句/哲思/唯美诗词归 quote；开源库/命令/配置/利器归 tool；冷幽默/吐槽归 joke；图片梗/视觉归 meme；日常随感/碎碎念归 fleeting。
4. 只输出标准 JSON 字符串，绝不输出任何多余解释或 markdown 标记。`;

/**
 * 内部统一解析 LLM 网关配置与 fetcher
 */
function resolveLLMConfig(options?: SparkLLMOptions) {
  const baseUrl = (
    options?.baseUrl ||
    process.env.MAGPIE_BASE_URL ||
    "http://127.0.0.1:3425/v1"
  ).replace(/\/+$/, "");

  const apiKey = options?.apiKey || process.env.MAGPIE_API_KEY || "magpie";
  const model =
    options?.model || process.env.MAGPIE_MODEL || "auto/gemini-3.8-flash";
  const timeoutMs =
    options?.timeoutMs ?? (Number(process.env.MAGPIE_TIMEOUT_MS) || 15000);
  const activeFetcher: typeof fetch =
    (options?.customFetcher as typeof fetch) ?? globalThis.fetch;

  return { baseUrl, apiKey, model, timeoutMs, activeFetcher };
}

/**
 * 轻量 LLM 语义提纯纯函数（默认走本地 Magpie 网关，支持注入 customFetcher）
 */
export async function distillWithLLM(
  content: string,
  options?: SparkLLMOptions
): Promise<SparkLLMResult> {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      title: "未命名灵感",
      type: "fleeting",
      cluster: "sparks",
      tags: ["#灵感"],
    };
  }

  const { baseUrl, apiKey, model, timeoutMs, activeFetcher } =
    resolveLLMConfig(options);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const endpoint = `${baseUrl}/chat/completions`;
  const payload = {
    model,
    messages: [
      { role: "system", content: SPARK_DISTILL_SYSTEM_PROMPT },
      { role: "user", content: trimmed },
    ],
    temperature: 0.1,
  };

  const [fetchErr, resp] = await tryit(activeFetcher)(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  clearTimeout(timer);

  if (fetchErr) {
    throw new Error(`[Tachikoma Sparks LLM] 请求网关失败: ${fetchErr.message}`);
  }

  if (!resp || !resp.ok) {
    const errorText = resp ? await resp.text() : "网络无响应";
    throw new Error(
      `[Tachikoma Sparks LLM] 网关返回错误 (${resp?.status}): ${errorText}`
    );
  }

  const [jsonErr, data] = await tryit(async (r: Response) => (await r.json()) as any)(resp);
  if (jsonErr || !data) {
    throw new Error(
      `[Tachikoma Sparks LLM] 解析网关 JSON 失败: ${jsonErr?.message}`
    );
  }

  const rawAssistantContent = data?.choices?.[0]?.message?.content || "";
  const cleaned = cleanJsonOutput(rawAssistantContent);

  const parsed = safeJsonParse<Record<string, any> | null>(cleaned, null);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      `[Tachikoma Sparks LLM] 模型未返回有效提纯结构: ${rawAssistantContent}`
    );
  }

  const title =
    typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim().slice(0, 50)
      : trimmed.split("\n")[0]?.slice(0, 30) || "未命名灵感";

  const type = normalizeSparkType(parsed.type);
  const cluster = normalizeSparkCluster(parsed.cluster);
  const rawTags = normalizeSparkTags(parsed.tags);
  const tags = rawTags.length > 0 ? rawTags : ["#灵感"];

  return {
    title,
    type,
    cluster,
    tags,
  };
}

/**
 * 视觉转录系统指令：逐字输出画面中的正文文案，不改写不解释
 */
export const IMAGE_TRANSCRIBE_PROMPT =
  "逐字输出画面中的正文文案，不改写、不概括、不补语气词、不输出解释；画面没有文字时返回空字符串。";

/**
 * 本地/网关多模态视觉转录纯函数（逐字提取图片正文文案）
 */
export async function transcribeImageWithLLM(
  imageDataUrl: string,
  options?: SparkLLMOptions
): Promise<string> {
  const trimmed = imageDataUrl.trim();
  if (!trimmed) {
    return "";
  }

  const { baseUrl, apiKey, model, timeoutMs, activeFetcher } =
    resolveLLMConfig(options);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const endpoint = `${baseUrl}/chat/completions`;
  const payload = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: IMAGE_TRANSCRIBE_PROMPT },
          { type: "image_url", image_url: { url: trimmed } },
        ],
      },
    ],
    temperature: 0,
  };

  const [fetchErr, resp] = await tryit(activeFetcher)(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  clearTimeout(timer);

  if (fetchErr || !resp || !resp.ok) {
    return "";
  }

  const [jsonErr, data] = await tryit(async (r: Response) => (await r.json()) as any)(resp);
  if (jsonErr || !data) {
    return "";
  }

  const rawAssistantContent = data?.choices?.[0]?.message?.content;
  if (typeof rawAssistantContent !== "string") {
    return "";
  }

  return rawAssistantContent.trim();
}

