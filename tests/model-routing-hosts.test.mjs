import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSkill = (...parts) => fs.readFileSync(path.join(root, "plugins", ...parts, "skills", "model-routing", "SKILL.md"), "utf8");

test("each remaining host receives only its own model-routing table", () => {
  const claude = readSkill("guidance");
  const antigravity = readSkill("antigravity-guidance");

  assert.match(claude, /`sonnet-5\.5`/);
  assert.doesNotMatch(claude, /`gpt-5\.5`|`gemini-3\.5-flash`/);
  assert.match(antigravity, /`gemini-3\.5-flash`/);
  assert.doesNotMatch(antigravity, /`sonnet-5`|`gpt-5\.5`/);
});

test("Claude and Antigravity guidance are registered only in their host packages", () => {
  const claudeMarketplace = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin", "marketplace.json"), "utf8"));
  assert.ok(claudeMarketplace.plugins.some(({ name }) => name === "guidance"));
  assert.ok(!claudeMarketplace.plugins.some(({ name }) => name === "antigravity-guidance"));
});
