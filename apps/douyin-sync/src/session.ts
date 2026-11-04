import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "pathe";
import { sleep, tryit } from "radash";
import {
  getTachikomaWorkspacePaths,
  toPosixPath,
  withPersistentBrowserContext,
} from "@tachikoma/core";

export type DouyinSessionStatus = "authed" | "anonymous";

export const AUTH_COOKIE_NAMES = ["sessionid", "sessionid_ss", "sid_tt"] as const;

export interface SessionCookieLike {
  name: string;
  value?: string;
}

/**
 * 纯函数：根据 cookie 集合判定是否满足抖音登录态（sessionid / sessionid_ss / sid_tt 任一存在且非空）
 */
export const isAuthedCookies = (cookies: SessionCookieLike[]): boolean => {
  return cookies.some(
    (c) =>
      AUTH_COOKIE_NAMES.includes(c.name as any) &&
      Boolean(c.value && c.value.trim().length > 0)
  );
};

/**
 * 定位抖音专用持久化 Profile 目录 (<workspace>/.secrets/douyin-profile)
 * 若目录不存在则按需创建
 */
export const resolveDouyinProfileDir = (customRootDir?: string): string => {
  if (process.env.DOUYIN_PROFILE_DIR && existsSync(process.env.DOUYIN_PROFILE_DIR)) {
    return toPosixPath(process.env.DOUYIN_PROFILE_DIR);
  }
  const root = customRootDir ?? getTachikomaWorkspacePaths().rootDir;
  const legacyPwProfile = toPosixPath(resolve(root, "../douyin-sync/.pw-profile"));
  if (existsSync(legacyPwProfile)) {
    return legacyPwProfile;
  }
  const profileDir = toPosixPath(join(root, ".secrets/douyin-profile"));
  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }
  return profileDir;
};

export interface HasDouyinSessionOptions {
  customProbe?: (userDataDir: string) => Promise<DouyinSessionStatus>;
  probeCookies?: (userDataDir: string) => Promise<SessionCookieLike[]>;
  timeoutMs?: number;
}

/**
 * 探活抖音持久化 Profile 登录态
 * 默认完全无头静默启动，零弹窗，检查会话 cookie
 * 支持传入 probeCookies 或 customProbe 沙盒注入，杜绝单测真起浏览器
 */
export const hasDouyinSession = async (
  userDataDir: string,
  options?: HasDouyinSessionOptions
): Promise<DouyinSessionStatus> => {
  if (options?.customProbe) {
    return await options.customProbe(userDataDir);
  }

  if (options?.probeCookies) {
    const cookies = await options.probeCookies(userDataDir);
    return isAuthedCookies(cookies) ? "authed" : "anonymous";
  }

  if (!existsSync(userDataDir)) {
    return "anonymous";
  }

  const [err, status] = await tryit(async () => {
    return await withPersistentBrowserContext(
      userDataDir,
      { headless: true, timeoutMs: options?.timeoutMs ?? 15000 },
      async (_page, context) => {
        const cookies = await context.cookies([
          "https://www.douyin.com",
          "https://douyin.com",
        ]);
        const targetCookies =
          cookies.length > 0 ? cookies : await context.cookies();
        return isAuthedCookies(targetCookies) ? "authed" : "anonymous";
      }
    );
  })();

  if (err || !status) {
    return "anonymous";
  }
  return status;
};

export interface LoginInteractiveOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  homepageUrl?: string;
  customProbe?: (userDataDir: string) => Promise<DouyinSessionStatus>;
}

/**
 * 有界面启动浏览器并轮询登录态（供人类扫码/交互登录）
 * 成功后安全回收浏览器并返回 authed
 * 纯函数式递归轮询，100% const，禁 while 游标
 */
export const loginInteractively = async (
  userDataDir: string,
  options?: LoginInteractiveOptions
): Promise<DouyinSessionStatus> => {
  if (options?.customProbe) {
    return await options.customProbe(userDataDir);
  }

  const timeoutMs = options?.timeoutMs ?? 180_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 2_000;
  const maxAttempts = Math.max(1, Math.floor(timeoutMs / pollIntervalMs));

  return await withPersistentBrowserContext(
    userDataDir,
    {
      headless: false,
      viewport: { width: 1280, height: 800 },
    },
    async (page, context) => {
      const targetUrl = options?.homepageUrl ?? "https://www.douyin.com";
      await tryit(() =>
        page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
      )();

      const poll = async (attemptsLeft: number): Promise<DouyinSessionStatus> => {
        if (attemptsLeft <= 0 || page.isClosed()) {
          return "anonymous";
        }
        const cookies = await context.cookies([
          "https://www.douyin.com",
          "https://douyin.com",
        ]);
        const targetCookies =
          cookies.length > 0 ? cookies : await context.cookies();
        if (isAuthedCookies(targetCookies)) {
          return "authed";
        }
        await sleep(pollIntervalMs);
        return poll(attemptsLeft - 1);
      };

      return await poll(maxAttempts);
    }
  );
};
