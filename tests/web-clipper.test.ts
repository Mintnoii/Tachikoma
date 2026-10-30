import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "pathe";
import {
  purifyArticle,
  clipUrl,
} from "@tachikoma/web-clipper";
import { readMarkdownFile } from "@dotagents/utils/markdown.ts";

const SANDBOX_DIR = join(process.cwd(), "tests/sandbox/web-clipper-test");

const MOCK_WECHAT_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>原始微信网页标题</title>
</head>
<body>
  <div id="js_article" class="rich_media">
    <h1 id="activity-name" class="rich_media_title">
      攻壳机动队：分布式 Agent 演化体系重构
    </h1>
    <div class="rich_media_meta_list">
      <span id="js_name" class="profile_nickname">草薙素子少佐</span>
    </div>
    <div id="js_content" class="rich_media_content">
      <p>在复杂的 AI 智能体体系中，第一性原理是穿透所有胶水层的基础。</p>
      <p>
        <img data-src="https://mmbiz.qpic.cn/mmbiz_png/sample/640?wx_fmt=png" alt="架构全景" />
      </p>
      <h2>架构设计与门禁</h2>
      <p>杜绝冗余抽象，追求极简契约。</p>
      <pre><code class="language-typescript">
export const AGENT_CORE = "Tachikoma";
console.log("Ready");
      </code></pre>
      <div id="js_pc_qr_code" class="qr_code_pc">
        <p>扫码关注公众号</p>
      </div>
      <div id="js_sponsor_ad">
        <p>广告推广内容</p>
      </div>
    </div>
  </div>
</body>
</html>
`;

test("Phase 3: Web Clipper Sub-App Comprehensive Tests", async (t) => {
  await rm(SANDBOX_DIR, { recursive: true, force: true });

  await t.test("Task 3.1 & 3.2: ArticlePurifier purifies WeChat article DOM", () => {
    const result = purifyArticle(
      MOCK_WECHAT_HTML,
      "https://mp.weixin.qq.com/s/sample_article_uuid"
    );

    assert.equal(result.title, "攻壳机动队：分布式 Agent 演化体系重构");
    assert.equal(result.byline, "草薙素子少佐");
    assert.equal(result.mediaType, "article");

    // 验证正文包含了核心文字
    assert.ok(result.content.includes("第一性原理是穿透所有胶水层的基础"));
    assert.ok(result.content.includes("## 架构设计与门禁"));
    assert.ok(result.content.includes("```typescript"));
    assert.ok(result.content.includes("AGENT_CORE = \"Tachikoma\""));

    // 验证图片 data-src 转换为了 markdown 图片语法
    assert.ok(result.content.includes("https://mmbiz.qpic.cn/mmbiz_png/sample/640?wx_fmt=png"));

    // 验证无用广告与二维码已被彻底过滤
    assert.ok(!result.content.includes("扫码关注公众号"));
    assert.ok(!result.content.includes("广告推广内容"));
  });

  await t.test("Task 3.2: ArticlePurifier identifies tweet mediaType", () => {
    const tweetHtml = `
      <html>
        <head><title>Karpathy on X: "LLM OS is evolving"</title></head>
        <body>
          <article>
            <p>LLM OS is rapidly becoming the universal runtime for cognition.</p>
          </article>
        </body>
      </html>
    `;
    const result = purifyArticle(tweetHtml, "https://x.com/karpathy/status/1880000000");
    assert.equal(result.mediaType, "tweet");
    assert.ok(result.content.includes("LLM OS is rapidly becoming"));
  });

  await t.test("Task 3.3: WebClipperPipeline end-to-end sandbox run", async () => {
    const mockFetcher = async (url: string) => ({
      html: MOCK_WECHAT_HTML,
      finalUrl: url,
    });

    const { result, filePath, sha256 } = await clipUrl(
      "https://mp.weixin.qq.com/s/sample_article_uuid",
      {
        outputDir: SANDBOX_DIR,
        customFetcher: mockFetcher,
      }
    );

    assert.equal(result.title, "攻壳机动队：分布式 Agent 演化体系重构");
    assert.ok(filePath.includes("articles/攻壳机动队：分布式 Agent 演化体系重构.md"));

    // 通过 @dotagents/utils 读取落盘卡片并验证 RFC-2026-0922
    const parsed = await readMarkdownFile(filePath);
    assert.equal(parsed.data.title, "攻壳机动队：分布式 Agent 演化体系重构");
    assert.equal(parsed.data.entry, "tachikoma");
    assert.equal(parsed.data.media_type, "article");
    assert.equal(parsed.data.sha256, sha256);
    assert.ok(parsed.body.includes("草薙素子少佐"));
    assert.ok(parsed.body.includes("```typescript"));
  });

  await rm(SANDBOX_DIR, { recursive: true, force: true });
});
