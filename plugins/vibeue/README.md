# VibeUE plugin

The `vibeue` plugin connects to the [VibeUE](https://github.com/kevinpbuckley/VibeUE)
Unreal Engine MCP server so Claude Code, Codex, and Antigravity can inspect
UMG Widget Blueprints and manage MVVM bindings directly in a running Unreal
Editor. It runs a small stdio MCP proxy that forwards to VibeUE's MCP HTTP
endpoint at `http://127.0.0.1:8080/mcp` (the Unreal MCP default). Until the
editor is open the proxy still answers: `tools/list` returns the last tool list
it saw (or the bundled `scripts/tools-snapshot.json`, captured from a running Unreal MCP server) and `tools/call`
returns an error saying the editor is not running. Once port 8080 answers, it
proxies every request and sends `notifications/tools/list_changed`.

## `/vibeue:umg-inspect-bind`

Resolves a Widget Blueprint name, inspects its UMG hierarchy and Blueprint
graph references, and applies MVVM bindings — or wires Blueprint EventGraph
nodes directly when MVVM binding alone is not enough.

```text
/vibeue:umg-inspect-bind Get full hierarchy of QuestViewBP and expand all BP references
/vibeue:umg-inspect-bind Add SetCommand binding on QuestViewBP for QuestPopupViewModel.Accept
```

## `/vibeue:umg-mvvm-binding`

Registers ViewModels and manages MVVM property bindings and MvvmButton
`SetCommand` command bindings, including custom-event destinations through
`MVVMEditorSubsystem`.

```text
/vibeue:umg-mvvm-binding Register GameHUDViewModel as HudVM and bind HealthPercent to HealthBar.Percent
```

## Prerequisites

- The target Unreal project has the VibeUE plugin installed and enabled, and
  the Unreal Editor is running and interactive.
- Unreal Editor 5.8+ with Epic's **Unreal MCP** and **Editor Tools** plugins enabled
  and the MCP server started (Editor Preferences → Model Context Protocol →
  Auto Start Server), plus the VibeUE plugin. VibeUE extends that server; its
  tools are `execute_python_code`, `call_tool`, and `VibeUE.*Service` toolsets.
  Epic documents `http://127.0.0.1:8000/mcp` as the stock endpoint, so set the
  port in the editor to match the proxy.
- VibeUE's MCP server is reachable at `http://127.0.0.1:8080/mcp` by default.
  Set `VIBEUE_MCP_PORT` to point at a different upstream port; the proxy
  validates it is an integer in `1-65535` and falls back to `8080` when unset.
  The proxy starts without the editor and reconnects automatically (polling
  every 2 seconds), including after an editor restart.
- Node.js is available locally to run the bundled `vibeue-proxy.mjs` (no
  `npx` or extra packages required). The last tool list is cached under the
  OS temp directory (`vibeue-mcp-proxy/`); that cache has the same format as
  `tools-snapshot.json`, so copy it over the snapshot to refresh the bundle.
- Codex does not act on `notifications/tools/list_changed` yet, so the bundled
  list is what a Codex session keeps. Open the Unreal Editor before starting
  Codex if the live list differs from the bundled one.

Both skills refuse to fall back to manual `.uasset` binary inspection when the
MCP tools are unavailable — they report the missing prerequisite instead.
