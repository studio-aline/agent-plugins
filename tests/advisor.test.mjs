import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "plugins", "advisor");
const skillPath = path.join(plugin, "skills", "advisor", "SKILL.md");

test("Advisor skill is portable, root-only, and has the required triggers", () => {
  const skill = fs.readFileSync(skillPath, "utf8");
  const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
  const frontmatterKeys = [...frontmatter.matchAll(/^([a-z-]+):/gmu)].map(([, key]) => key);

  assert.deepEqual(frontmatterKeys, ["name", "description"]);
  assert.match(frontmatter, /^name: advisor$/m);
  assert.match(frontmatter, /^description: /m);
  assert.doesNotMatch(frontmatter, /^(argument-hint|disable-model-invocation|user-invocable):/m);
  assert.doesNotMatch(skill, /\$ARGUMENTS|\$\{CLAUDE_PLUGIN_ROOT\}/u);
  assert.match(skill, /GPT-6 Astra/);
  assert.match(skill, /explicitly asks for Advisor/);
  assert.match(skill, /multi_agent_v1__spawn_agent/);
  assert.match(skill, /multi_agent_v1__wait_agent/);
  assert.match(skill, /multi_agent_v1__close_agent/);
  assert.match(skill, /codex@openai-codex/);
  assert.match(skill, /\/codex:rescue/);
  assert.match(skill, /read-only consultation and must not edit files/);
  assert.doesNotMatch(skill, /codex_investigate/);
  assert.match(skill, /model: "gpt-6-astra"/);
  assert.match(skill, /subagent[\s\S]*do not [^\n]*initiate[^\n]*Advisor/i);
  assert.match(skill, /explicitly assigned the role of GPT-6 Astra\s+Advisor/);
  assert.match(skill, /read-only/);
  assert.match(skill, /Antigravity package currently has no supported GPT-6 Astra adapter/);
});

test("Advisor metadata and manifests describe the same read-only skill", () => {
  const codexManifest = JSON.parse(fs.readFileSync(path.join(plugin, ".codex-plugin", "plugin.json"), "utf8"));
  const claudeManifest = JSON.parse(fs.readFileSync(path.join(plugin, ".claude-plugin", "plugin.json"), "utf8"));
  const hooks = JSON.parse(fs.readFileSync(path.join(plugin, "hooks", "hooks.json"), "utf8"));
  const openai = fs.readFileSync(path.join(plugin, "skills", "advisor", "agents", "openai.yaml"), "utf8");

  assert.equal(codexManifest.name, "advisor");
  assert.equal(codexManifest.version, "0.1.1");
  assert.equal(codexManifest.skills, "./skills/");
  assert.deepEqual(codexManifest.interface.capabilities, ["Read"]);
  assert.equal(claudeManifest.name, "advisor");
  assert.equal(claudeManifest.dependencies, undefined);
  assert.ok(hooks.hooks.SessionStart?.length);
  assert.ok(hooks.hooks.SubagentStart?.length);
  assert.match(openai, /display_name: "X7 GPT-6 Astra Advisor"/);
  assert.match(openai, /default_prompt: "Use \$advisor/);
  assert.match(openai, /allow_implicit_invocation: true/);
});

test("Advisor is registered in both marketplaces and generated for Antigravity", () => {
  const claudeMarketplace = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin", "marketplace.json"), "utf8"));
  const codexMarketplace = JSON.parse(fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
  const claudeEntry = claudeMarketplace.plugins.find(({ name }) => name === "advisor");
  const codexEntry = codexMarketplace.plugins.find(({ name }) => name === "advisor");
  const generatedRoot = path.join(root, ".agents", "plugins", "advisor");

  assert.deepEqual(claudeEntry, {
    name: "advisor",
    source: "./plugins/advisor",
    description: "Ask GPT-6 Astra for a read-only second opinion before complex work."
  });
  assert.equal(codexEntry.source.path, "./plugins/advisor");
  assert.equal(codexEntry.policy.installation, "AVAILABLE");
  assert.equal(codexEntry.policy.authentication, "ON_INSTALL");
  assert.equal(codexEntry.category, "Developer Tools");
  assert.equal(
    fs.readFileSync(path.join(generatedRoot, "skills", "advisor", "SKILL.md"), "utf8"),
    fs.readFileSync(skillPath, "utf8")
  );
  assert.equal(
    fs.readFileSync(path.join(generatedRoot, "skills", "advisor", "agents", "openai.yaml"), "utf8"),
    fs.readFileSync(path.join(plugin, "skills", "advisor", "agents", "openai.yaml"), "utf8")
  );
  assert.equal(
    fs.readFileSync(path.join(generatedRoot, "scripts", "inject-advisor-boundary.mjs"), "utf8"),
    fs.readFileSync(path.join(plugin, "scripts", "inject-advisor-boundary.mjs"), "utf8")
  );
  const generatedManifest = JSON.parse(fs.readFileSync(path.join(generatedRoot, "plugin.json"), "utf8"));
  assert.equal(generatedManifest.name, "advisor");
  assert.equal(generatedManifest.description, "Ask GPT-6 Astra for a read-only second opinion before complex work.");
});

test("Advisor workflow forwards the canonical skill and boundary rule is persistent", () => {
  const workflow = fs.readFileSync(path.join(root, ".agent", "workflows", "advisor.md"), "utf8");
  const rule = fs.readFileSync(path.join(root, ".agents", "rules", "advisor.md"), "utf8");

  assert.match(workflow, /^---\r?\ndescription:/m);
  assert.match(workflow, /`advisor` skill/);
  assert.match(workflow, /\/advisor/);
  assert.match(rule, /primary\/root task agent/);
  assert.match(rule, /subagent[\s\S]*must never[\s\S]*initiate/i);
  assert.match(rule, /no Astra adapter/);
});

test("Claude Advisor hook injects root guidance and blocks subagent consultations", () => {
  const script = path.join(plugin, "scripts", "inject-advisor-boundary.mjs");
  for (const [hookEventName, expected, forbidden] of [
    ["SessionStart", /primary Claude task session/, /subagent\/worker context/],
    ["SubagentStart", /subagent\/worker context/, /primary Claude task session/]
  ]) {
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      input: JSON.stringify({ hook_event_name: hookEventName }),
      encoding: "utf8",
      windowsHide: true
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, hookEventName);
    assert.match(output.hookSpecificOutput.additionalContext, expected);
    assert.doesNotMatch(output.hookSpecificOutput.additionalContext, forbidden);
    assert.match(output.hookSpecificOutput.additionalContext, /Advisor/);
  }
});
