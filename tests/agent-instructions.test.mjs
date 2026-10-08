import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("agent instructions require Claude Code, Codex, and Antigravity skill packaging", () => {
  const instructions = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(instructions, /support Claude Code, Codex, and Google\s+Antigravity/);
  assert.match(instructions, /\.claude-plugin\/plugin\.json/);
  assert.match(instructions, /\.codex-plugin\/plugin\.json/);
  assert.match(instructions, /\.claude-plugin\/marketplace\.json/);
  assert.match(instructions, /\.agents\/plugins\/marketplace\.json/);
  assert.match(instructions, /agents\/openai\.yaml/);
  assert.match(instructions, /npm run sync:antigravity/);
  assert.match(instructions, /npm run validate:antigravity/);
  assert.match(instructions, /\.agent\/workflows\/<skill>\.md/);
  assert.match(instructions, /npm run validate:codex/);
});

for (const entrypoint of ["CLAUDE.md", "GEMINI.md"]) {
  test(`${entrypoint} mirrors the canonical agent instructions`, () => {
    const canonical = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    assert.equal(fs.readFileSync(path.join(root, entrypoint), "utf8"), canonical);
  });
}
