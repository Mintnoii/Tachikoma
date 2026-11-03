import test from "node:test";
import assert from "node:assert/strict";
import { rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "pathe";
import {
  resolveDouyinProfileDir,
  hasDouyinSession,
  isAuthedCookies,
  loginInteractively,
  fetchPublicAwemeItem,
  DouyinExtractionError,
} from "@tachikoma/douyin-sync";
import { program } from "@tachikoma/cli";

const SANDBOX_DIR = join(process.cwd(), "tests/sandbox/authed-session-test");

test("OpenSpec douyin-authed-session-fallback Tests", async (t) => {
  await rm(SANDBOX_DIR, { recursive: true, force: true });
  await mkdir(SANDBOX_DIR, { recursive: true });

  t.after(async () => {
    await rm(SANDBOX_DIR, { recursive: true, force: true });
  });

  await t.test("5.1: resolveDouyinProfileDir anchors to workspace and creates directory", () => {
    const customWorkspace = join(SANDBOX_DIR, "workspace_alpha");
    const profileDir = resolveDouyinProfileDir(customWorkspace);
    assert.equal(profileDir, join(customWorkspace, ".secrets/douyin-profile").replace(/\\/g, "/"));
    assert.ok(existsSync(profileDir), ".secrets/douyin-profile 必须已被按需创建");
  });

  await t.test("5.2: isAuthedCookies and hasDouyinSession determine authed/anonymous accurately via probe", async () => {
    // 纯函数判定
    assert.equal(isAuthedCookies([{ name: "sessionid", value: "s_12345" }]), true);
    assert.equal(isAuthedCookies([{ name: "sessionid_ss", value: "ss_12345" }]), true);
    assert.equal(isAuthedCookies([{ name: "sid_tt", value: "tt_12345" }]), true);
    assert.equal(isAuthedCookies([{ name: "sessionid", value: "" }]), false);
    assert.equal(isAuthedCookies([{ name: "other_cookie", value: "val" }]), false);
    assert.equal(isAuthedCookies([]), false);

    // hasDouyinSession 注入探活
    const authedStatus = await hasDouyinSession("/virtual/dir", {
      probeCookies: async () => [{ name: "sessionid", value: "valid_session" }],
    });
    assert.equal(authedStatus, "authed");

    const anonymousStatus = await hasDouyinSession("/virtual/dir", {
      probeCookies: async () => [{ name: "passport_csrf_token", value: "token" }],
    });
    assert.equal(anonymousStatus, "anonymous");

    // 不存在目录直接返回 anonymous，不启动浏览器
    const nonExistentStatus = await hasDouyinSession(join(SANDBOX_DIR, "non-existent-dir"));
    assert.equal(nonExistentStatus, "anonymous");

    // customProbe 支持
    const customStatus = await hasDouyinSession("/virtual/dir", {
      customProbe: async () => "authed",
    });
    assert.equal(customStatus, "authed");
  });

  await t.test("5.3: loginInteractively succeeds with probe", async () => {
    const status = await loginInteractively("/virtual/dir", {
      customProbe: async () => "authed",
    });
    assert.equal(status, "authed");
  });

  await t.test("5.3: 有登录态时直接走登录态通道，不再先跑一遍必败的匿名", async () => {
    const calls: Array<{ url: string; isAuthed?: boolean }> = [];

    const mockExtractor = async (url: string, context?: { isAuthed?: boolean }) => {
      calls.push({ url, isAuthed: context?.isAuthed });
      return {
        id: "7709999999",
        desc: "登录态直接提取成功的抖音作品",
        author: { uid: "u1", secUid: "sec1", nickname: "认证创作者" },
        createTime: 1730500000,
        mediaType: "video" as const,
        shareUrl: "https://www.douyin.com/video/7709999999",
      };
    };

    const result = await fetchPublicAwemeItem("https://www.douyin.com/video/7709999999", {
      customExtractor: mockExtractor,
      session: { userDataDir: "/virtual/profile" },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].isAuthed, true);
    assert.equal(result.confidence, "authed-session");
    assert.equal(result.source, "authed-session");
    assert.equal(result.desc, "登录态直接提取成功的抖音作品");
  });

  await t.test("5.4: 登录态失败时退回匿名，两者皆败则抛出登录态错误", async () => {
    const calls: Array<{ url: string; isAuthed?: boolean }> = [];

    const mockExtractor = async (url: string, context?: { isAuthed?: boolean }) => {
      calls.push({ url, isAuthed: context?.isAuthed });
      throw new DouyinExtractionError("dom-fallback-empty", "提取全部未命中", {
        attempts: ["in-page-xhr:403", "dom-fallback"],
      });
    };

    await assert.rejects(
      async () => {
        await fetchPublicAwemeItem("https://www.douyin.com/video/7708888888", {
          customExtractor: mockExtractor,
          session: { userDataDir: "/virtual/profile" },
        });
      },
      (err: any) => {
        assert.ok(err instanceof DouyinExtractionError);
        assert.equal(err.reason, "dom-fallback-empty");
        assert.ok(err.attempts.includes("dom-fallback"));
        return true;
      }
    );

    // 登录态一次 + 匿名兜底一次
    assert.equal(calls.length, 2);
    assert.equal(calls[0].isAuthed, true);
    assert.equal(calls[1].isAuthed, false);
  });

  await t.test("5.5: 无登录态时只跑匿名通道", async () => {
    const calls: Array<{ isAuthed?: boolean }> = [];

    const result = await fetchPublicAwemeItem("https://www.douyin.com/video/7707777777", {
      customExtractor: async (_url: string, context?: { isAuthed?: boolean }) => {
        calls.push({ isAuthed: context?.isAuthed });
        return {
          id: "7707777777",
          desc: "匿名提取成功",
          author: { uid: "", secUid: "", nickname: "匿名作者" },
          createTime: 1730500000,
          mediaType: "video" as const,
          shareUrl: "https://www.douyin.com/video/7707777777",
        };
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].isAuthed, false);
    assert.equal(result.desc, "匿名提取成功");
  });

  await t.test("CLI command definitions include douyin subcommands", () => {
    const commands = program.commands.map((c) => c.name());
    assert.ok(commands.includes("douyin"), "CLI 必须注册 douyin 命令");

    const douyinCmd = program.commands.find((c) => c.name() === "douyin");
    assert.ok(douyinCmd);
    const subCommands = douyinCmd!.commands.map((c) => c.name());
    assert.ok(subCommands.includes("status"), "douyin 子命令必须包含 status");
    assert.ok(subCommands.includes("login"), "douyin 子命令必须包含 login");
  });
});
