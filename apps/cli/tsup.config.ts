import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  removeNodeProtocol: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  noExternal: [/@tachikoma\/.*/],
  external: [
    "node:sqlite",
    "playwright-core",
    "jsdom",
    "turndown",
    "@mozilla/readability",
    "@sinclair/typebox",
    "gray-matter",
    "pathe",
    "radash",
    "commander",
  ],
});
