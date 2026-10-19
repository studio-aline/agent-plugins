import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "plugins", "mr-video");
const skillDir = path.join(plugin, "skills", "mr-video");
const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");

test("mr-video is registered for Claude Code and Codex with aligned manifests", () => {
  const claudeMarketplace = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin", "marketplace.json"), "utf8"));
  const codexMarketplace = JSON.parse(fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
  assert.equal(claudeMarketplace.plugins.find(({ name }) => name === "mr-video").source, "./plugins/mr-video");
  const codexEntry = codexMarketplace.plugins.find(({ name }) => name === "mr-video");
  assert.equal(codexEntry.source.path, "./plugins/mr-video");
  assert.equal(codexEntry.policy.installation, "AVAILABLE");
  assert.equal(codexEntry.policy.authentication, "ON_INSTALL");
  assert.equal(codexEntry.category, "Developer Tools");

  const claudeManifest = JSON.parse(fs.readFileSync(path.join(plugin, ".claude-plugin", "plugin.json"), "utf8"));
  const codexManifest = JSON.parse(fs.readFileSync(path.join(plugin, ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(claudeManifest.name, "mr-video");
  assert.equal(codexManifest.name, claudeManifest.name);
  assert.equal(claudeManifest.version, "0.2.2");
  assert.equal(codexManifest.version, claudeManifest.version);
  assert.equal(codexManifest.skills, "./skills/");
  assert.equal(codexManifest.description, claudeManifest.description);
});

test("mr-video skill is portable and resolves its CLI relative to the skill folder", () => {
  const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
  const keys = frontmatter.split(/\r?\n/u).filter((line) => /^[\w-]+:/u.test(line)).map((line) => line.split(":", 1)[0]).sort();
  assert.deepEqual(keys, ["description", "name"]);
  assert.match(frontmatter, /^name: mr-video$/m);
  assert.doesNotMatch(skill, /\$ARGUMENTS|\$\{CLAUDE_PLUGIN_ROOT\}/u);
  assert.doesNotMatch(skill, /[A-Z]:[\\/]/u, "no absolute Windows paths");
  assert.doesNotMatch(skill, /mcp__/u, "no host-specific tool names");

  assert.match(skill, /<skill>\/\.\.\/\.\.\/scripts\/bin\/mr-video\.mjs/u);
  assert.match(skill, /<skill>\/\.\.\/\.\.\/scripts\/bin\/setup\.mjs/u);
  for (const file of ["bin/mr-video.mjs", "bin/setup.mjs", "package.json", "package-lock.json", "src/cli.ts"]) {
    assert.ok(fs.existsSync(path.join(skillDir, "..", "..", "scripts", file)), file);
  }

  const metadata = fs.readFileSync(path.join(skillDir, "agents", "openai.yaml"), "utf8");
  assert.match(metadata, /display_name: "[^"]+"/u);
  assert.match(metadata, /short_description: "[^"]+"/u);
  assert.match(metadata, /default_prompt: "[^"]*\$mr-video/u);
  assert.match(metadata, /allow_implicit_invocation: false/u);
});

test("mr-video skill keeps its safety rules", () => {
  assert.match(skill, /명시적으로 요청받았을 때만 실행/u);
  assert.match(skill, /토큰 값을 출력하거나 대신 입력하지 않는다/u);
  assert.match(skill, /업로드 성공 전에는 MR을 건드리지 않는다/u);
  assert.match(skill, /마커 블록 밖의 본문은 절대 바꾸지 않는다/u);
  assert.match(skill, /MRV same body\.new\.md body\.saved\.md/u);
  assert.match(skill, /실행하지 않은 테스트를 통과했다고 쓰지 않는다/u);
  // Hosts without a GitLab MCP (Codex) save through the CLI instead of inventing a route.
  assert.match(skill, /GitLab MCP가 있으면[\s\S]*?MRV save-description/u);
});

test("mr-video keeps the latest video in the description and every render as a new comment", () => {
  assert.match(skill, /본문 영상은 항상 최신/u);
  assert.match(skill, /plan\.delta\.json/u);
  assert.match(skill, /MRV note --upload upload\.delta\.json --plan plan\.delta\.json --delta/u);
  assert.match(skill, /기존 코멘트는 고치지 않고 \*\*언제나 새 코멘트\*\*/u);
  // Same rule as the description: MCP when the host has one, the CLI otherwise.
  assert.match(skill, /GitLab MCP가 있으면\*\* `note\.md`[\s\S]*?MRV post-note/u);
});

test("mr-video is excluded from Antigravity and the exclusion is documented", () => {
  assert.ok(!fs.existsSync(path.join(root, ".agents", "plugins", "mr-video")));
  assert.ok(!fs.existsSync(path.join(root, ".agent", "workflows", "mr-video.md")));
  const sync = fs.readFileSync(path.join(root, "scripts", "sync-antigravity-plugins.mjs"), "utf8");
  assert.doesNotMatch(sync.match(/const pluginNames = \[[^\]]*\]/u)[0], /mr-video/u);
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /`mr-video` is not packaged for Antigravity/u);
});

test("mr-video CLI asks for setup instead of crashing when dependencies are missing", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mr-video-bin-"));
  try {
    fs.mkdirSync(path.join(scratch, "bin"));
    fs.copyFileSync(path.join(plugin, "scripts", "bin", "mr-video.mjs"), path.join(scratch, "bin", "mr-video.mjs"));
    const run = spawnSync(process.execPath, [path.join(scratch, "bin", "mr-video.mjs"), "schema"], { encoding: "utf8" });
    assert.equal(run.status, 1);
    const result = JSON.parse(run.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.needsSetup, true);
    assert.match(result.error, /setup\.mjs/u);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
