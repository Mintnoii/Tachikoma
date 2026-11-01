import { Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const EntryTypeSchema = Type.Union([
  Type.Literal("wechat-clipper"),
  Type.Literal("twitter-clipper"),
  Type.Literal("douyin-sync"),
  Type.Literal("manual-research"),
  Type.Literal("manual-notes"),
  Type.Literal("ai-conversation"),
]);

export const MediaTypeSchema = Type.Union([
  Type.Literal("article"),
  Type.Literal("tweet"),
  Type.Literal("video"),
  Type.Literal("gallery"),
]);

export const AuthorInfoSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  id: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  avatar: Type.Optional(Type.String()),
});

export const RFC2026FrontmatterSchema = Type.Object({
  title: Type.String({ minLength: 1 }),
  entry: EntryTypeSchema,
  media_type: MediaTypeSchema,
  source_url: Type.String({ minLength: 1 }),
  created_at: Type.String(),
  tags: Type.Array(Type.String()),
  author: Type.Optional(AuthorInfoSchema),
  sha256: Type.Optional(Type.String()),
  extra: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const IngestionResultSchema = Type.Object({
  sourceUrl: Type.String({ minLength: 1 }),
  entry: Type.Optional(EntryTypeSchema),
  mediaType: MediaTypeSchema,
  title: Type.String({ minLength: 1 }),
  author: AuthorInfoSchema,
  content: Type.String(),
  rawAssets: Type.Optional(Type.Array(Type.String())),
  metadata: Type.Record(Type.String(), Type.Unknown()),
  createdAt: Type.String(),
  sha256: Type.Optional(Type.String()),
});

export type IngestionResultSchemaType = Static<typeof IngestionResultSchema>;
export type RFC2026FrontmatterSchemaType = Static<typeof RFC2026FrontmatterSchema>;

/**
 * 契约校验工厂：基于 TypeBox 的第一性无防御断言校验
 */
const createSchemaValidator = <T>(schema: any, schemaName: string) => (data: unknown): T => {
  if (Value.Check(schema, data)) {
    return data as T;
  }
  const summary = [...Value.Errors(schema, data)]
    .map((e) => `${e.path}: ${e.message}`)
    .join("; ");
  throw new Error(`[Tachikoma Core] ${schemaName} 契约校验失败: ${summary}`);
};

export const validateIngestionResult = createSchemaValidator<IngestionResultSchemaType>(
  IngestionResultSchema,
  "IngestionResult"
);

export const validateFrontmatter = createSchemaValidator<RFC2026FrontmatterSchemaType>(
  RFC2026FrontmatterSchema,
  "Frontmatter"
);

/**
 * 战术灵感类型枚举契约
 */
export const SparkTypeSchema = Type.Union([
  Type.Literal("quote"), // 金句、诗词、文案
  Type.Literal("tool"), // 好玩开源工具、CLI神兵利器、实用网站
  Type.Literal("joke"), // 段子、冷幽默、神级吐槽
  Type.Literal("meme"), // 梗图、架构手绘、视觉资产
  Type.Literal("fleeting"), // 其他即兴随笔闪念
]);

/**
 * 战术灵感生命周期状态契约
 */
export const SparkStatusSchema = Type.Union([
  Type.Literal("seed"), // 种子态：刚随手存入，未经分类或仅有粗标签
  Type.Literal("growing"), // 生长态：同类标签聚集，自然涌现为微主题簇
  Type.Literal("evergreen"), // 常青态：高频调用或标为神级收藏
]);

/**
 * 战术灵感核心 MOC 领域契约 (6+1 架构)
 * soul: 明心见性 (修心/觉察/哲学心性/内心宁静/命运思考)
 * literature: 咬文嚼字 (唯美句子/文艺文案/诗意/浪漫/电影台词)
 * life: 人间烟火 (生活方式/美食咖啡/家居器物/宠物/松弛感日常)
 * arsenal: 实用工具库 (开源项目/CLI工具/黑科技/生产力工具)
 * meme: 熬夜背梗 (梗图/搞笑段子/幽默吐槽)
 * sparks: 有趣却无用 (突发奇想/灵感火花/灵感洞察/产品巧思)
 * custom/<slug>: 涌现主题簇
 */
export const SPARK_CORE_CLUSTERS = [
  "soul",
  "literature",
  "life",
  "arsenal",
  "meme",
  "sparks",
] as const;

export type SparkCoreCluster = (typeof SPARK_CORE_CLUSTERS)[number];

export const SparkCoreClusterSchema = Type.Union([
  Type.Literal("soul"),
  Type.Literal("literature"),
  Type.Literal("life"),
  Type.Literal("arsenal"),
  Type.Literal("meme"),
  Type.Literal("sparks"),
]);

export const SparkClusterSchema = Type.Union([
  SparkCoreClusterSchema,
  Type.String({ description: "自适应涌现的主题簇 (如 custom/<slug>)" }),
]);

export type SparkCluster = SparkCoreCluster | `custom/${string}` | (string & {});

/**
 * 战术灵感完整记录契约
 */
export const SparkRecordSchema = Type.Object({
  id: Type.String({ minLength: 1, description: "KSUID、UUID 或 Nanoid 唯一标识" }),
  type: SparkTypeSchema,
  status: SparkStatusSchema,
  title: Type.String({ minLength: 1, description: "提纯后的一句话标题或亮点" }),
  content: Type.String({ description: "原始文案、正文或工具描述" }),
  sourceUrl: Type.Optional(Type.String({ description: "原始链接或仓库地址" })),
  assetPath: Type.Optional(Type.String({ description: "如果为本地图片/梗图，存储在 assets/memes/ 相对路径" })),
  tags: Type.Array(Type.String(), { description: "扁平标签集合，如 ['#CLI', '#Rust', '#终端']" }),
  cluster: Type.Optional(Type.String({ description: "自然生长涌现出的微领域主题簇名称 (soul | literature | life | arsenal | meme | sparks | custom/<slug>)" })),
  accessCount: Type.Number({ default: 0, description: "调用与检索命中频次" }),
  createdAt: Type.String({ description: "ISO 时间戳" }),
  updatedAt: Type.String({ description: "ISO 时间戳" }),
});

/**
 * 创建战术灵感入参契约
 */
export const CreateSparkInputSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1 })),
  type: SparkTypeSchema,
  status: Type.Optional(SparkStatusSchema),
  title: Type.String({ minLength: 1 }),
  content: Type.String(),
  sourceUrl: Type.Optional(Type.String()),
  assetPath: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  cluster: Type.Optional(Type.String()),
  accessCount: Type.Optional(Type.Number()),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});

/**
 * 更新战术灵感入参契约
 */
export const UpdateSparkInputSchema = Type.Object({
  type: Type.Optional(SparkTypeSchema),
  status: Type.Optional(SparkStatusSchema),
  title: Type.Optional(Type.String({ minLength: 1 })),
  content: Type.Optional(Type.String()),
  sourceUrl: Type.Optional(Type.String()),
  assetPath: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  cluster: Type.Optional(Type.String()),
  accessCount: Type.Optional(Type.Number()),
  updatedAt: Type.Optional(Type.String()),
});

export type SparkType = Static<typeof SparkTypeSchema>;
export type SparkStatus = Static<typeof SparkStatusSchema>;
export type SparkRecord = Static<typeof SparkRecordSchema>;
export type CreateSparkInput = Static<typeof CreateSparkInputSchema>;
export type UpdateSparkInput = Static<typeof UpdateSparkInputSchema>;

export const validateSparkRecord = createSchemaValidator<SparkRecord>(
  SparkRecordSchema,
  "SparkRecord"
);

export const validateCreateSparkInput = createSchemaValidator<CreateSparkInput>(
  CreateSparkInputSchema,
  "CreateSparkInput"
);

