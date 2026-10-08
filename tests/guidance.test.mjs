import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "plugins", "guidance");

test("marketplace contains the guidance plugin", () => {
  const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin", "marketplace.json"), "utf8"));
  const entry = marketplace.plugins.find((candidate) => candidate.name === "guidance");
  assert.ok(entry);
  assert.equal(entry.source, "./plugins/guidance");
});

test("shared guidance contains Claude policy without Codex execution rules", () => {
  const skill = fs.readFileSync(path.join(plugin, "skills", "model-routing", "SKILL.md"), "utf8");
  assert.match(skill, /Team Claude model-routing policy/);
  assert.match(skill, /\| `haiku-5\.5`\s+\|/);
  assert.match(skill, /Never select `haiku-5\.5` for work that ships, plan or implementation reviews/);
  assert.doesNotMatch(skill, /Never select Haiku\./);
  assert.doesNotMatch(skill, /codex_/i);
  assert.doesNotMatch(skill, /\/codex:/i);
});

const script = path.join(plugin, "scripts", "inject-model-routing.mjs");

function runHook(hookEventName, claudeConfig) {
  const configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "guidance-"));
  try {
    if (claudeConfig !== undefined) fs.writeFileSync(path.join(configDirectory, ".claude.json"), claudeConfig);
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      env: { ...process.env, CLAUDE_CONFIG_DIR: configDirectory },
      input: JSON.stringify({ hook_event_name: hookEventName }),
      encoding: "utf8",
      windowsHide: true
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    fs.rmSync(configDirectory, { recursive: true, force: true });
  }
}

const account = (oauthAccount) => JSON.stringify({ oauthAccount });

test("model-routing skill gates fable-5.1 on plan eligibility", () => {
  const skill = fs.readFileSync(path.join(plugin, "skills", "model-routing", "SKILL.md"), "utf8");
  assert.match(skill, /## Fable availability/);
  assert.match(skill, /Max, Team Premium, and Enterprise/);
  assert.match(skill, /never select `fable-5\.1`; use `opus-5\.5` instead/);
});

test("guidance hook reports fable eligibility from account metadata", () => {
  const cases = [
    [account({ seatTier: "team_standard", organizationType: "claude_team" }), /ineligible \(seatTier=team_standard\)\. Do not select fable-5\.1/],
    [account({ seatTier: "team_premium", organizationType: "claude_team" }), /: eligible \(/],
    [account({ organizationType: "claude_max" }), /: eligible \(/],
    [account({ organizationType: "claude_enterprise" }), /: eligible \(/],
    [account({ organizationType: "claude_pro" }), /ineligible \(organizationType=claude_pro\)/],
    [undefined, /: unknown \(/],
    ["{not json", /: unknown \(/]
  ];
  for (const [claudeConfig, expected] of cases) {
    const context = runHook("SessionStart", claudeConfig).hookSpecificOutput.additionalContext;
    assert.match(context, /Team Claude model-routing policy/);
    assert.match(context, expected);
  }
});

test("guidance hook emits structured context for sessions and subagents", () => {
  for (const hookEventName of ["SessionStart", "SubagentStart"]) {
    const output = runHook(hookEventName, account({ seatTier: "team_standard" }));
    assert.equal(output.hookSpecificOutput.hookEventName, hookEventName);
    assert.match(output.hookSpecificOutput.additionalContext, /Team Claude model-routing policy/);
    assert.match(output.hookSpecificOutput.additionalContext, /Codex extension is conditional/);
    assert.match(output.hookSpecificOutput.additionalContext, /codex@openai-codex/);
    assert.ok(output.hookSpecificOutput.additionalContext.length < 10000);
  }
});
