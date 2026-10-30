import test from "node:test";
import assert from "node:assert/strict";
import { program } from "@tachikoma/cli";

test("Phase 4: Tachikoma CLI Interface Tests", async (t) => {
  await t.test("CLI commands and options definition", () => {
    assert.equal(program.name(), "tachikoma");
    const commands = program.commands.map((c) => c.name());
    assert.ok(commands.includes("ingest"));
    assert.ok(commands.includes("sync"));
  });
});
