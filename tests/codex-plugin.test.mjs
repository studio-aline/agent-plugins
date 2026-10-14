import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
assert.equal(marketplace.name, "x7");
assert.deepEqual(marketplace.plugins.map(({ name }) => name), ["advisor", "ripgrep", "git", "internal-web", "vibeue", "mr-video"]);

for (const entry of marketplace.plugins) {
  assert.equal(entry.source.path, `./plugins/${entry.name}`);
  assert.equal(entry.policy.installation, "AVAILABLE");
  assert.equal(entry.policy.authentication, "ON_INSTALL");
  const pluginRoot = path.join(root, "plugins", entry.name);
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.name, entry.name);
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/);
  assert.ok(fs.statSync(path.join(pluginRoot, manifest.skills)).isDirectory());
  for (const item of fs.readdirSync(path.join(pluginRoot, "skills"), { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const skill = fs.readFileSync(path.join(pluginRoot, "skills", item.name, "SKILL.md"), "utf8");
    const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
    assert.match(frontmatter, /^name: /m);
    assert.match(frontmatter, /^description: /m);
    assert.doesNotMatch(frontmatter, /^(argument-hint|disable-model-invocation|user-invocable):/m);
    assert.doesNotMatch(skill, /\$ARGUMENTS|\$\{CLAUDE_PLUGIN_ROOT\}/u);
  }
}
process.stdout.write("Codex plugin packaging is valid.\n");
