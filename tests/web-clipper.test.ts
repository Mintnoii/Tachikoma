import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "pathe";
import {
  purifyArticle,
  extractMetaDescription,
  parseHtmlToDoc,
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
    <div id="js_content" class="rich_media_content" style="visibility: hidden; opacity: 0;">
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
    assert.equal(parsed.data.entry, "wechat-clipper");
    assert.equal(parsed.data.media_type, "article");
    assert.equal(parsed.data.sha256, sha256);
    assert.ok(parsed.body.includes("草薙素子少佐"));
    assert.ok(parsed.body.includes("```typescript"));
  });

  await t.test("Task 3.4: ArticlePurifier cleans visibility: hidden and opacity: 0 on #js_content and descendants", () => {
    const htmlWithHidden = `
      <div id="js_article">
        <h1 id="activity-name">测试隐藏样式文章</h1>
        <span id="js_name">作者名</span>
        <div id="js_content" style="visibility: hidden; opacity: 0; color: red;">
          <p style="visibility: hidden;">这是子节点隐藏文本。</p>
          <p style="opacity: 0;">这是透明度为0的文本。</p>
          <p><img data-src="https://example.com/pic.png" alt="配图" /></p>
        </div>
      </div>
    `;
    const result = purifyArticle(htmlWithHidden, "https://mp.weixin.qq.com/s/test_hidden");
    assert.equal(result.title, "测试隐藏样式文章");
    assert.equal(result.byline, "作者名");
    assert.ok(result.content.includes("这是子节点隐藏文本。"));
    assert.ok(result.content.includes("这是透明度为0的文本。"));
    assert.ok(result.content.includes("https://example.com/pic.png"));
  });

  await t.test("Task 3.5: ArticlePurifier prioritizes #js_content when Readability parsed content is too short (< 200)", () => {
    // 模拟微信前端带有 hidden style 且 Readability 抓取过短或误判丢弃时的场景
    const shortHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>微型微信短讯</title></head>
      <body>
        <div id="js_article">
          <h1 id="activity-name">微型资讯速递</h1>
          <span id="js_name">快讯早报</span>
          <div id="js_content" style="visibility: hidden; opacity: 0;">
            <p>这是一则字数较短但包含重要事实的情报速报，字数小于200字。</p>
            <p><img data-src="https://example.com/brief.png" alt="速报配图" /></p>
          </div>
        </div>
      </body>
      </html>
    `;
    const result = purifyArticle(shortHtml, "https://mp.weixin.qq.com/s/short_sample");
    assert.equal(result.title, "微型资讯速递");
    assert.equal(result.byline, "快讯早报");
    assert.ok(result.content.includes("这是一则字数较短但包含重要事实的情报速报"));
    assert.ok(result.content.includes("https://example.com/brief.png"));
    assert.equal(result.excerpt, "这是一则字数较短但包含重要事实的情报速报，字数小于200字。");
  });

  await t.test(
    "Task 3.6: extractMetaDescription pure function decodes escapes, entities, and stitches og:image",
    () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="author" content="数字游民少佐" />
          <meta property="og:description" content="第一行动态要点\\x0a第二行包含\\x26lt;span\\x26gt;重点标签\\x26lt;/span\\x26gt;与 &quot;双引号&quot; &#39;单引号&#39;\\n第三行换行测试" />
          <meta property="og:image" content="https://mmbiz.qpic.cn/sample_cover.png" />
          <meta property="og:site_name" content="微信公众平台" />
        </head>
        <body></body>
        </html>
      `;
      const doc = parseHtmlToDoc(html);
      const res = extractMetaDescription(doc);
      assert.ok(res);
      assert.equal(res.author, "数字游民少佐");
      assert.equal(res.ogImage, "https://mmbiz.qpic.cn/sample_cover.png");
      assert.ok(
        res.content.includes("第一行动态要点\n第二行包含<span>重点标签</span>与 \"双引号\" '单引号'\n第三行换行测试")
      );
      assert.ok(res.content.endsWith("![](https://mmbiz.qpic.cn/sample_cover.png)"));
    }
  );

  await t.test(
    "Task 3.7: ArticlePurifier enhances WeChat video / micro-dynamic pages without #js_content via meta description",
    () => {
      // 模拟真实微信视频号/短图文动态：无 #js_content，正文存在于 meta description 中且 > 200 字
      const videoDynamicHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="Pi Agent 运行时架构深度解析" />
          <meta name="author" content="DigitalDrifter" />
          <meta property="og:description" content="Pi Agent 是一个本地优先的 Coding Agent Harness\\x0a\\x26lt;a class=\\x26quot;wx_topic_link\\x26quot;\\x26gt;#Pi\\x26lt;/a\\x26gt; 把 Coding Agent 运行时需要的几件事组织起来：模型接入、调用工具、读写文件和执行 Shell、保存 Session、扩展新的能力。\\x0a\\x0aPi 的循环：模型先判断下一步做什么，需要工具就调用工具，工具返回结果后再交给模型，然后继续下一轮。也就是：Model → Tool → Result → Model。很多 CodingAgent 最底层，本质上都绕不开这个循环。模型适配有单独的 pi-ai，AgentLoop 放在 pi-agent-core，再往上才是 Session、终端、项目上下文。以上是完整论断，字数超两百字。" />
          <meta property="og:image" content="https://mmbiz.qpic.cn/sz_mmbiz_jpg/cover.jpg" />
        </head>
        <body>
          <div class="video_container">
            <span class="tips">视频播放插件</span>
          </div>
        </body>
        </html>
      `;

      const result = purifyArticle(videoDynamicHtml, "https://mp.weixin.qq.com/s/r7oyN69ff9L0-csJ_fwczw");
      assert.equal(result.title, "Pi Agent 运行时架构深度解析");
      assert.equal(result.byline, "DigitalDrifter");
      assert.equal(result.mediaType, "article");
      assert.ok(result.content.includes("Pi Agent 是一个本地优先的 Coding Agent Harness"));
      assert.ok(result.content.includes('<a class="wx_topic_link">#Pi</a>'));
      assert.ok(result.content.includes("Model → Tool → Result → Model"));
      assert.ok(result.content.includes("![](https://mmbiz.qpic.cn/sz_mmbiz_jpg/cover.jpg)"));
    }
  );

  await t.test(
    "Task 3.8: extractMetaDescription returns null when no description meta tags exist",
    () => {
      const emptyHtml = `<html><head><title>空描述测试</title></head><body><p>正文</p></body></html>`;
      const doc = parseHtmlToDoc(emptyHtml);
      const res = extractMetaDescription(doc);
      assert.equal(res, null);
    }
  );

  await rm(SANDBOX_DIR, { recursive: true, force: true });
});
