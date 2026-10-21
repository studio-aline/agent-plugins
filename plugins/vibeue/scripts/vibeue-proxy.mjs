import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const DEFAULT_PORT = "8080";
const POLL_INTERVAL_MS = 2000;
const INIT_TIMEOUT_MS = 3000;
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const OFFLINE_MESSAGE =
  "Unreal Editor is not running or its VibeUE MCP server is not reachable. " +
  "Open the Unreal Editor with the VibeUE plugin loaded, then retry.";

export function resolvePort(env = process.env) {
  const raw = env.VIBEUE_MCP_PORT;
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  if (!/^\d+$/u.test(raw) || Number(raw) < 1 || Number(raw) > 65535) {
    throw new Error(
      `VIBEUE_MCP_PORT must be an integer between 1 and 65535, got: ${raw}`,
    );
  }
  return raw;
}

export function upstreamUrl(port) {
  return `http://127.0.0.1:${port}/mcp`;
}

export function cacheFilePath(port, tmpdir = os.tmpdir()) {
  return path.join(tmpdir, "vibeue-mcp-proxy", `tools-${port}.json`);
}

/** Tool list captured from a running Unreal MCP server; used until a live or cached list exists. */
export const BUNDLED_TOOLS = JSON.parse(
  fs.readFileSync(new URL("./tools-snapshot.json", import.meta.url), "utf8"),
);

export function offlineToolResult() {
  return { content: [{ type: "text", text: OFFLINE_MESSAGE }], isError: true };
}

/** Extract JSON-RPC messages from a Streamable HTTP response body. */
export function parseSseMessages(text) {
  const messages = [];
  for (const event of text.split(/\r?\n\r?\n/u)) {
    const data = event
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /u, ""))
      .join("\n");
    if (!data) continue;
    try {
      messages.push(JSON.parse(data));
    } catch {
      // ignore non-JSON events
    }
  }
  return messages;
}

export class VibeueProxy {
  constructor({ port, write, fetchImpl = fetch, cacheFile, log = () => {} }) {
    this.url = upstreamUrl(port);
    this.write = write;
    this.fetch = fetchImpl;
    this.cacheFile = cacheFile;
    this.log = log;
    this.sessionId = undefined;
    this.online = false;
    this.clientInitParams = undefined;
    this.clientReady = false;
    this.connecting = undefined;
    this.nextUpstreamId = 1;
    this.cachedTools = this.loadCache();
  }

  loadCache() {
    if (!this.cacheFile) return undefined;
    try {
      const tools = JSON.parse(fs.readFileSync(this.cacheFile, "utf8"));
      return Array.isArray(tools) && tools.length > 0 ? tools : undefined;
    } catch {
      return undefined;
    }
  }

  saveCache(tools) {
    this.cachedTools = tools;
    if (!this.cacheFile) return;
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      fs.writeFileSync(this.cacheFile, JSON.stringify(tools));
    } catch (error) {
      this.log(`tool cache write failed: ${error.message}`);
    }
  }

  async post(message, { timeoutMs, relay } = {}) {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const response = await this.fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) this.sessionId = sessionId;
    if (response.status === 202 || message.id === undefined) {
      await response.body?.cancel?.();
      return { status: response.status, message: undefined };
    }
    if (!response.ok) {
      await response.body?.cancel?.();
      return { status: response.status, message: undefined };
    }
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/event-stream")) {
      return { status: response.status, message: await response.json() };
    }
    let answer;
    for (const item of parseSseMessages(await response.text())) {
      if (item.id === message.id && (item.result || item.error)) answer = item;
      else relay?.(item);
    }
    return { status: response.status, message: answer };
  }

  /** Initialize an upstream MCP session. Resolves true when online. */
  connect() {
    if (this.online) return Promise.resolve(true);
    this.connecting ??= this.doConnect().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  async doConnect() {
    this.sessionId = undefined;
    try {
      const init = await this.post(
        {
          jsonrpc: "2.0",
          id: `proxy-init-${this.nextUpstreamId++}`,
          method: "initialize",
          params: this.clientInitParams ?? {
            protocolVersion: DEFAULT_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "vibeue-proxy", version: "1" },
          },
        },
        { timeoutMs: INIT_TIMEOUT_MS },
      );
      if (!init.message?.result) return false;
      await this.post(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { timeoutMs: INIT_TIMEOUT_MS },
      );
    } catch {
      return false;
    }
    this.online = true;
    await this.refreshTools();
    this.notifyToolsChanged();
    return true;
  }

  async refreshTools() {
    try {
      const { message } = await this.post(
        {
          jsonrpc: "2.0",
          id: `proxy-tools-${this.nextUpstreamId++}`,
          method: "tools/list",
        },
        { timeoutMs: INIT_TIMEOUT_MS * 5 },
      );
      if (Array.isArray(message?.result?.tools)) {
        this.saveCache(message.result.tools);
      }
    } catch (error) {
      this.log(`tools/list refresh failed: ${error.message}`);
    }
  }

  notifyToolsChanged() {
    if (!this.clientReady) return;
    this.write({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
  }

  startPolling() {
    const timer = setInterval(() => {
      if (!this.online) void this.connect();
    }, POLL_INTERVAL_MS);
    timer.unref?.();
    void this.connect();
    return timer;
  }

  offlineTools() {
    return this.cachedTools ?? BUNDLED_TOOLS;
  }

  /** Forward a message upstream; undefined means the upstream is unusable. */
  async forward(message) {
    const wasOnline = this.online;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!(await this.connect())) return undefined;
      try {
        const result = await this.post(message, {
          relay: (item) => this.write(item),
        });
        if (message.id === undefined) return null;
        if (result.message) return result.message;
        // Session expired (editor restarted) or non-JSON failure: reconnect once.
        this.online = false;
        this.sessionId = undefined;
      } catch {
        this.online = false;
        this.sessionId = undefined;
        break;
      }
    }
    this.online = false;
    this.sessionId = undefined;
    if (wasOnline) this.notifyToolsChanged();
    return undefined;
  }

  async handle(message) {
    const { id, method } = message;
    if (method === "notifications/initialized") {
      this.clientReady = true;
      return;
    }
    if (id === undefined) {
      if (this.online) await this.forward(message);
      return;
    }
    if (method === "initialize") {
      this.clientInitParams = message.params;
      this.write({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion:
            message.params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: "VibeUE (proxy)", version: "1" },
        },
      });
      return;
    }
    if (method === "ping") {
      this.write({ jsonrpc: "2.0", id, result: {} });
      return;
    }
    const upstream = await this.forward(message);
    if (upstream) {
      if (method === "tools/list" && upstream.result?.tools) {
        this.saveCache(upstream.result.tools);
      }
      this.write(upstream);
      return;
    }
    if (method === "tools/list") {
      this.write({ jsonrpc: "2.0", id, result: { tools: this.offlineTools() } });
    } else if (method === "tools/call") {
      this.write({ jsonrpc: "2.0", id, result: offlineToolResult() });
    } else {
      this.write({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: OFFLINE_MESSAGE },
      });
    }
  }
}

function main() {
  const port = resolvePort();
  const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
  const proxy = new VibeueProxy({
    port,
    write,
    cacheFile: cacheFilePath(port),
    log: (line) => process.stderr.write(`[vibeue-proxy] ${line}\n`),
  });
  proxy.startPolling();
  const input = readline.createInterface({ input: process.stdin });
  const pending = new Set();
  input.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const task = proxy.handle(message).finally(() => pending.delete(task));
    pending.add(task);
  });
  input.on("close", () => {
    void Promise.allSettled(pending).then(() => process.exit(0));
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
