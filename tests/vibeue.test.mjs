import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BUNDLED_TOOLS,
  VibeueProxy,
  cacheFilePath,
  parseSseMessages,
  resolvePort,
  upstreamUrl,
} from "../plugins/vibeue/scripts/vibeue-proxy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "plugins", "vibeue");

test("port resolution defaults to 8080 and accepts a valid override", () => {
  assert.equal(resolvePort({}), "8080");
  assert.equal(resolvePort({ VIBEUE_MCP_PORT: "" }), "8080");
  assert.equal(resolvePort({ VIBEUE_MCP_PORT: "9090" }), "9090");
  assert.equal(upstreamUrl("9090"), "http://127.0.0.1:9090/mcp");
});

test("port resolution rejects invalid overrides", () => {
  for (const value of ["abc", "0", "70000", "8080; rm -rf /"]) {
    assert.throws(
      () => resolvePort({ VIBEUE_MCP_PORT: value }),
      /integer between 1 and 65535/,
    );
  }
});

test("SSE bodies are parsed into JSON-RPC messages", () => {
  const body = [
    "event: message",
    'data: {"id":1,"result":{}}',
    "",
    "data: not json",
    "",
    "",
  ].join("\n");
  assert.deepEqual(parseSseMessages(body), [{ id: 1, result: {} }]);
});

async function startUpstream() {
  const state = { sessions: 0, calls: [] };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const message = JSON.parse(body);
      state.calls.push(message.method);
      const reply = (result) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
      };
      if (message.method === "initialize") {
        state.sessions += 1;
        res.setHeader("mcp-session-id", `s${state.sessions}`);
        return reply({ protocolVersion: "2025-06-18", capabilities: {} });
      }
      if (message.id === undefined) {
        res.statusCode = 202;
        return res.end();
      }
      if (req.headers["mcp-session-id"] !== `s${state.sessions}`) {
        res.statusCode = 404;
        return res.end();
      }
      if (message.method === "tools/list") {
        return reply({ tools: [{ name: "real_tool", inputSchema: {} }] });
      }
      return reply({ content: [{ type: "text", text: "real" }] });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, state, port: server.address().port };
}

function makeProxy(port, cacheFile) {
  const out = [];
  const proxy = new VibeueProxy({ port, write: (m) => out.push(m), cacheFile });
  const ask = async (method, params) => {
    const id = out.length + 100;
    await proxy.handle({ jsonrpc: "2.0", id, method, params });
    return out.find((m) => m.id === id);
  };
  return { proxy, out, ask };
}

test("offline proxy serves the bundled Unreal tool list and errors on tool calls", async () => {
  const cacheFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "vibeue-test-")),
    "tools.json",
  );
  const { ask, proxy, out } = makeProxy(1, cacheFile);
  const init = await ask("initialize", { protocolVersion: "2025-03-26" });
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.equal(init.result.capabilities.tools.listChanged, true);
  await proxy.handle({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.deepEqual((await ask("tools/list")).result.tools, BUNDLED_TOOLS);
  assert.ok(BUNDLED_TOOLS.length > 0);
  assert.ok(
    BUNDLED_TOOLS.every((tool) => tool.name && tool.inputSchema?.type === "object"),
  );
  const call = await ask("tools/call", { name: "manage_asset" });
  assert.equal(call.result.isError, true);
  assert.match(call.result.content[0].text, /Unreal Editor is not running/);
  assert.equal((await ask("resources/list")).error.code, -32601);
  assert.equal(
    out.some((m) => m.method === "notifications/tools/list_changed"),
    false,
  );
});

test("proxy switches to forwarding once the editor port opens and survives a restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeue-test-"));
  const upstream = await startUpstream();
  const { proxy, out, ask } = makeProxy(
    upstream.port,
    cacheFilePath("test", dir),
  );
  try {
    await ask("initialize", { protocolVersion: "2025-06-18" });
    await proxy.handle({ jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(await proxy.connect(), true);
    assert.ok(out.some((m) => m.method === "notifications/tools/list_changed"));
    assert.equal((await ask("tools/list")).result.tools[0].name, "real_tool");
    assert.equal(
      (await ask("tools/call", { name: "real_tool" })).result.content[0].text,
      "real",
    );
    // Editor restart: the old upstream session id is rejected, proxy re-initializes.
    upstream.state.sessions += 1;
    assert.equal(
      (await ask("tools/call", { name: "real_tool" })).result.content[0].text,
      "real",
    );
    assert.equal(upstream.state.sessions, 3);
    // The last tool list is cached for the next offline start.
    const cached = JSON.parse(fs.readFileSync(cacheFilePath("test", dir), "utf8"));
    assert.equal(cached[0].name, "real_tool");
  } finally {
    upstream.server.close();
    upstream.server.closeAllConnections();
  }
  // Editor closed: falls back to the cached tool list and announces the change.
  const before = out.length;
  const list = await ask("tools/list");
  assert.equal(list.result.tools[0].name, "real_tool");
  assert.ok(
    out
      .slice(before)
      .some((m) => m.method === "notifications/tools/list_changed"),
  );
  assert.equal((await ask("tools/call", {})).result.isError, true);
});

test("host-specific MCP configuration points to the stdio proxy script", () => {
  const claude = JSON.parse(
    fs.readFileSync(path.join(plugin, ".mcp.json"), "utf8"),
  );
  const codexManifest = JSON.parse(
    fs.readFileSync(path.join(plugin, ".codex-plugin", "plugin.json"), "utf8"),
  );
  const antigravity = JSON.parse(
    fs.readFileSync(path.join(plugin, "mcp_config.json"), "utf8"),
  );
  const antigravityServers = Object.values(antigravity.mcpServers);
  assert.match(
    claude.mcpServers["VibeUE"].args[0],
    /CLAUDE_PLUGIN_ROOT.*vibeue-proxy\.mjs/,
  );
  assert.equal(
    codexManifest.mcpServers["VibeUE"].args[0],
    "./scripts/vibeue-proxy.mjs",
  );
  assert.equal(codexManifest.mcpServers["VibeUE"].cwd, ".");
  assert.equal(antigravityServers.length, 1);
  assert.equal(
    antigravityServers[0].args[0],
    "./scripts/vibeue-proxy.mjs",
  );
  assert.ok(
    fs.existsSync(path.join(plugin, "scripts", "vibeue-proxy.mjs")),
  );
});

test("idempotent binding upsert checks the raw MVVM binding, not list_view_model_bindings paths", () => {
  const skill = fs.readFileSync(
    path.join(plugin, "skills", "umg-mvvm-binding", "SKILL.md"),
    "utf8",
  );
  const workflow = skill.split("### Workflow D")[1].split("### Workflow E")[0];
  assert.match(workflow, /def binding_exists\(/);
  assert.match(workflow, /export_text\(\)/);
  assert.doesNotMatch(workflow, /in b\.source_path/);
  assert.doesNotMatch(workflow, /in b\.destination_path/);
});

test("skills target the Unreal 5.8 VibeUE tool surface", () => {
  const files = [
    "skills/umg-inspect-bind/SKILL.md",
    "skills/umg-mvvm-binding/SKILL.md",
    "references/tool-contracts.md",
    "references/troubleshooting.md",
    "references/vibeue-mcp-pitfalls.md",
  ].map((file) => fs.readFileSync(path.join(plugin, file), "utf8"));
  const text = files.join("\n");
  assert.match(text, /execute_python_code/);
  assert.match(text, /AssetRegistryHelpers\.get_asset_registry/);
  // Removed from the 5.8 tool surface; may only appear as a "no longer exists" note.
  assert.doesNotMatch(text, /manage_asset\(/);
  assert.doesNotMatch(text, /manage_skills\(/);
  assert.doesNotMatch(
    text,
    /AssetDiscoveryService\.get_asset_(dependencies|referencers)/,
  );
  assert.doesNotMatch(
    text,
    /BlueprintService\.add_(get_variable|set_variable|member_get|function_call)_node\(/,
  );
});
