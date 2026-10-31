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
