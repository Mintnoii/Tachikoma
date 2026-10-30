import test from "node:test";
import assert from "node:assert/strict";
import { rm, readFile } from "node:fs/promises";
import { join } from "pathe";
import {
  IngestionResult,
  validateIngestionResult,
  validateFrontmatter,
  formatToRFC2026Markdown,
  persistIngestionResult,
} from "@tachikoma/core";
import { readMarkdownFile } from "@dotagents/utils/markdown.ts";

const SANDBOX_DIR = join(process.cwd(), "tests/sandbox/core-test");

test("Task 1.3: Core Schema & RFC Formatting in isolated sandbox", async (t) => {
  // 清理沙盒
  await rm(SANDBOX_DIR, { recursive: true, force: true });

  await t.test("Valid IngestionResult conforms to schema", () => {
    const validData: IngestionResult = {
      sourceUrl: "https://example.com/article/1",
      mediaType: "article",
      title: "深入理解系统架构",
      author: {
        name: "攻壳机动队",
        id: "tachikoma-01",
      },
      content: "## 架构设计第一性原理\n\n以第一性原理驱动重构。",
      metadata: { source: "web", tags: ["architecture", "refactoring"] },
      createdAt: new Date().toISOString(),
    };

    const validated = validateIngestionResult(validData);
    assert.equal(validated.title, "深入理解系统架构");
  });

  await t.test("Invalid IngestionResult throws descriptive error", () => {
    const invalidData = {
      sourceUrl: "",
      mediaType: "invalid-type",
    };

    assert.throws(
      () => validateIngestionResult(invalidData),
      /IngestionResult 契约校验失败/
    );
  });

  await t.test("formatToRFC2026Markdown creates compliant frontmatter and sha256", () => {
    const item: IngestionResult = {
      sourceUrl: "https://v.douyin.com/test1234/",
      mediaType: "gallery",
      title: "图文精选测试",
      author: {
        name: "测试创作者",
      },
      content: "## OCR 识别文本\n\n这是测试卡片的第一页内容。",
      metadata: { galleryCount: 1 },
      createdAt: "2026-10-31T03:00:00.000Z",
    };

    const { markdown, sha256, frontmatter } = formatToRFC2026Markdown(item);
    assert.ok(sha256 && sha256.length === 64, "SHA-256 哈希计算完整");
    assert.equal(frontmatter.entry, "tachikoma");
    assert.equal(frontmatter.media_type, "gallery");
    assert.ok(markdown.includes("entry: tachikoma"));
    assert.ok(markdown.includes("sha256: " + sha256));
    assert.ok(markdown.includes("## OCR 识别文本"));

    // 验证 frontmatter schema
    const checkedFm = validateFrontmatter(frontmatter);
    assert.equal(checkedFm.title, "图文精选测试");
  });

  await t.test("persistIngestionResult writes to isolated sandbox without touching Ghost", async () => {
    const item: IngestionResult = {
      sourceUrl: "https://mp.weixin.qq.com/s/sample_article",
      mediaType: "article",
      title: "沙盒安全落盘测试",
      author: {
        name: "沙盒作者",
      },
      content: "这是测试落盘的内容，不会影响外部系统。",
      metadata: { test: true },
      createdAt: "2026-10-31T03:00:00.000Z",
    };

    const { filePath, sha256 } = await persistIngestionResult(item, SANDBOX_DIR, "articles");
    assert.ok(filePath.includes("tests/sandbox/core-test/articles/沙盒安全落盘测试.md"));

    // 通过 @dotagents/utils 的 readMarkdownFile 读取并检验
    const parsed = await readMarkdownFile(filePath);
    assert.equal(parsed.data.title, "沙盒安全落盘测试");
    assert.equal(parsed.data.entry, "tachikoma");
    assert.equal(parsed.data.sha256, sha256);
    assert.ok(parsed.body.includes("这是测试落盘的内容"));
  });

  // 收尾清理沙盒
  await rm(SANDBOX_DIR, { recursive: true, force: true });
});
