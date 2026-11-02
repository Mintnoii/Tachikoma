import { chromium, type BrowserContext, type Page } from "playwright-core";
import { tryit } from "radash";
import { toPosixPath } from "./utils/path.js";

export const DEFAULT_DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

export const DEFAULT_MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

export interface BrowserPageOptions {
  headless?: boolean;
  cdpEndpoint?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  isMobile?: boolean;
  hasTouch?: boolean;
  args?: string[];
  timeoutMs?: number;
}

/**
 * 统一无头浏览器会话生命周期函数式上下文作用域
 * 统一接管 CDP/Launch、无痕 Context、UserAgent、Page 与确定性资源回收
 */
export async function withBrowserPage<T>(
  options: BrowserPageOptions | undefined,
  fn: (page: Page, context: BrowserContext) => Promise<T>
): Promise<T> {
  const ownBrowser = !options?.cdpEndpoint;
  const defaultArgs = [
    "--no-startup-window",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
  ];

  const browser = ownBrowser
    ? await chromium.launch({
        headless: options?.headless ?? true,
        args: options?.args ?? defaultArgs,
      })
    : await chromium.connectOverCDP(options!.cdpEndpoint!);

  const isMobile = options?.isMobile ?? false;
  const defaultUserAgent = isMobile
    ? DEFAULT_MOBILE_USER_AGENT
    : DEFAULT_DESKTOP_USER_AGENT;
  const defaultViewport = isMobile
    ? { width: 390, height: 844 }
    : { width: 1280, height: 800 };

  const context = options?.cdpEndpoint
    ? browser.contexts()[0] ?? (await browser.newContext())
    : await browser.newContext({
        userAgent: options?.userAgent ?? defaultUserAgent,
        viewport: options?.viewport ?? defaultViewport,
        isMobile,
        hasTouch: options?.hasTouch ?? isMobile,
      });

  const page = await context.newPage();
  if (options?.timeoutMs) {
    page.setDefaultTimeout(options.timeoutMs);
  }
  const [execErr, result] = await tryit(fn)(page, context);

  if (!page.isClosed()) {
    await tryit(() => page.close())();
  }
  await tryit(() => context.close())();
  if (ownBrowser) {
    await tryit(() => browser.close())();
  }

  if (execErr) {
    throw execErr;
  }
  return result!;
}

/**
 * 持久化浏览器会话生命周期函数式上下文作用域
 * 统一接管 launchPersistentContext、持久化 Profile 目录与确定性资源回收
 */
export async function withPersistentBrowserContext<T>(
  userDataDir: string,
  options: BrowserPageOptions | undefined,
  fn: (page: Page, context: BrowserContext) => Promise<T>
): Promise<T> {
  const defaultArgs = [
    "--no-startup-window",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
  ];

  const isMobile = options?.isMobile ?? false;
  const defaultUserAgent = isMobile
    ? DEFAULT_MOBILE_USER_AGENT
    : DEFAULT_DESKTOP_USER_AGENT;
  const defaultViewport = isMobile
    ? { width: 390, height: 844 }
    : { width: 1280, height: 800 };

  const context = await chromium.launchPersistentContext(toPosixPath(userDataDir), {
    headless: options?.headless ?? true,
    args: options?.args ?? defaultArgs,
    userAgent: options?.userAgent ?? defaultUserAgent,
    viewport: options?.viewport ?? defaultViewport,
    isMobile,
    hasTouch: options?.hasTouch ?? isMobile,
  });

  const page = context.pages()[0] ?? (await context.newPage());
  if (options?.timeoutMs) {
    page.setDefaultTimeout(options.timeoutMs);
  }
  const [execErr, result] = await tryit(fn)(page, context);

  if (!page.isClosed()) {
    await tryit(() => page.close())();
  }
  await tryit(() => context.close())();

  if (execErr) {
    throw execErr;
  }
  return result!;
}
