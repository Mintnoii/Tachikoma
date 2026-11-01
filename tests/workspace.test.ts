import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveWorkspaceRoot,
  getTachikomaWorkspacePaths,
  getTachikomaDataPaths,
  resolveGhostRawDir,
} from "@tachikoma/core";
import { resolve, parse } from "pathe";
import { homedir } from "node:os";

describe("Tachikoma Workspace & Path Anchor Tests", () => {
  it("resolves workspace root to directory containing pnpm-workspace.yaml", () => {
    const root = resolveWorkspaceRoot();
    assert.ok(root.length > 0, "root should not be empty");
    assert.match(root.toLowerCase(), /tachikoma/, "should point to tachikoma root");

    // 验证孤立根目录下的 ~/.tachikoma 回退兜底
    const fsRoot = parse(process.cwd()).root;
    const fallbackRoot = resolveWorkspaceRoot(fsRoot);
    assert.strictEqual(fallbackRoot, resolve(homedir(), ".tachikoma"));
  });

  it("getTachikomaWorkspacePaths anchors sparks db and assets to workspace root", () => {
    const paths = getTachikomaWorkspacePaths();
    assert.strictEqual(paths.sparksDbPath, resolve(paths.rootDir, ".sparks/sparks.db"));
    assert.strictEqual(paths.sparksAssetsDir, resolve(paths.rootDir, ".sparks/assets"));
    assert.strictEqual(paths.defaultOutputDir, resolve(paths.rootDir, "output"));
    assert.ok(paths.ghostRawDir.length > 0, "ghostRawDir should not be empty");
    assert.strictEqual(getTachikomaDataPaths, getTachikomaWorkspacePaths);
    assert.match(resolveGhostRawDir(), /Ghost[/\\]_raw/);
  });

  it("respects customRoot when provided", () => {
    const custom = resolve(homedir(), "custom-tachikoma-sandbox");
    const paths = getTachikomaWorkspacePaths({ customRoot: custom });
    assert.strictEqual(paths.rootDir, custom);
    assert.strictEqual(paths.sparksDbPath, resolve(custom, ".sparks/sparks.db"));
    assert.strictEqual(paths.sparksAssetsDir, resolve(custom, ".sparks/assets"));
  });

  it("respects TACHIKOMA_HOME when configured and valid", () => {
    const original = process.env.TACHIKOMA_HOME;
    try {
      process.env.TACHIKOMA_HOME = homedir();
      const root = resolveWorkspaceRoot();
      assert.strictEqual(root, resolve(homedir()));
    } finally {
      if (original) {
        process.env.TACHIKOMA_HOME = original;
      } else {
        delete process.env.TACHIKOMA_HOME;
      }
    }
  });
});

