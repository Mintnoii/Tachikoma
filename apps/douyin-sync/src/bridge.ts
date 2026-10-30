import { chromium, type BrowserContext, type Page } from "playwright-core";
import { sift, tryit } from "radash";
import { toPosixPath } from "@dotagents/utils/path.ts";

export type CustomTransport = (path: string, params?: Record<string, unknown>) => Promise<any>;

export interface BrowserBridgeOptions {
  profileDir?: string;
  cdpEndpoint?: string;
  headless?: boolean;
  homepageUrl?: string;
  customTransport?: CustomTransport; // 支持测试环境沙盒注入模拟请求
}

export interface BrowserBridge {
  readonly ensurePage: () => Promise<Page>;
  readonly requestJson: <T = any>(path: string, params?: Record<string, unknown>) => Promise<T>;
  readonly close: () => Promise<void>;
}

const DEFAULT_HOMEPAGE = "https://www.douyin.com/user/self?showTab=favorite_collection";

const IN_PAGE_XHR_SCRIPT = `
async (requestUrl) => {
  return await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", requestUrl, true);
    xhr.withCredentials = true;
    xhr.timeout = 30000;
    xhr.onload = () => {
      try {
        resolve({ ok: true, status: xhr.status, data: JSON.parse(xhr.responseText) });
      } catch (err) {
        resolve({ ok: false, status: xhr.status, error: String(err), raw: xhr.responseText });
      }
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, error: "Network error" });
    xhr.ontimeout = () => resolve({ ok: false, status: 0, error: "Request timeout" });
    xhr.send();
  });
}
`;

/**
 * 现代 TypeScript 浏览器同源桥接器：打开浏览器上下文与同源会话
 */
export const openBrowserBridge = (options: BrowserBridgeOptions = {}): BrowserBridge => {
  const opts: BrowserBridgeOptions = {
    headless: true,
    homepageUrl: DEFAULT_HOMEPAGE,
    ...options,
  };

  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let initPromise: Promise<Page> | null = null;

  /**
   * 初始化浏览器上下文与同源会话页（基于 Promise 单飞防重，杜绝 busy-wait 游标循环）
   */
  const ensurePage = async (): Promise<Page> => {
    if (page && !page.isClosed()) {
      return page;
    }

    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      if (opts.cdpEndpoint) {
        const browser = await chromium.connectOverCDP(opts.cdpEndpoint);
        context = browser.contexts()[0] ?? (await browser.newContext());
      } else if (opts.profileDir) {
        const profilePath = toPosixPath(opts.profileDir);
        context = await chromium.launchPersistentContext(profilePath, {
          headless: opts.headless ?? true,
          viewport: { width: 1280, height: 800 },
          args: ["--disable-blink-features=AutomationControlled"],
        });
      } else {
        const browser = await chromium.launch({
          headless: opts.headless ?? true,
        });
        context = await browser.newContext();
      }

      const activePage = await context.newPage();
      // 导航至个人收藏夹页面，初始化 securitySDK 签名环境
      await activePage.goto(opts.homepageUrl || DEFAULT_HOMEPAGE, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      page = activePage;
      return activePage;
    })().finally(() => {
      initPromise = null;
    });

    return initPromise;
  };

  /**
   * 执行同源签名 API 请求（基于 radash.sift 声明式构建查询参数）
   */
  const requestJson = async <T = any>(
    path: string,
    params: Record<string, unknown> = {}
  ): Promise<T> => {
    if (opts.customTransport) {
      return (await opts.customTransport(path, params)) as T;
    }

    const activePage = await ensurePage();
    const queryEntries = sift(
      Object.entries(params).map(([k, v]) => (v != null ? ([k, String(v)] as [string, string]) : null))
    );
    const queryString = new URLSearchParams(queryEntries).toString();
    const fullPath = queryString ? `${path}?${queryString}` : path;

    const [err, res] = await tryit(activePage.evaluate.bind(activePage))(
      IN_PAGE_XHR_SCRIPT,
      fullPath
    );

    if (err) {
      throw new Error(`[BrowserBridge] 页面 XHR 执行异常: ${err.message}`);
    }

    const payload = res as {
      ok: boolean;
      status: number;
      data?: T;
      error?: string;
      raw?: string;
    };

    if (!payload.ok) {
      throw new Error(
        `[BrowserBridge] 接口响应失败 (status=${payload.status}): ${payload.error || payload.raw}`
      );
    }

    return payload.data as T;
  };

  /**
   * 关闭桥接实例
   */
  const close = async (): Promise<void> => {
    await tryit(async () => {
      if (page && !page.isClosed()) {
        await page.close();
      }
      if (context) {
        await context.close();
      }
    })();
    page = null;
    context = null;
  };

  return {
    ensurePage,
    requestJson,
    close,
  };
};

export const closeBrowserBridge = async (bridge: BrowserBridge): Promise<void> => {
  await bridge.close();
};
