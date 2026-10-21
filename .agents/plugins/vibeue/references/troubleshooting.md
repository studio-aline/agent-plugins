# VibeUE Troubleshooting Notes

Load this document when a `umg-inspect-bind` or `umg-mvvm-binding` run fails,
is ambiguous, or produces inconsistent results, and the skill's own "Common
Failures" table is not enough.

## What this guidance is designed to avoid

- Context-window bloat from always importing every VibeUE reference doc up
  front — load this file and `vibeue-mcp-pitfalls.md` only on failure.
- Pathless Blueprint lookup failures from missing name-to-path resolution.
- MVVM ordering mistakes (creating a binding before ViewModel registration).
- Binding regressions from wrong mode selection (`OneWayToDestination` vs
  `TwoWay`).
- False success claims without post-mutation verification (compile + report).
- Destructive or guess-based edits when targets are ambiguous.
- MCP call failures caused by the Unreal Editor not running, or VibeUE tools
  not being loaded/visible yet.
- MCP call timeouts/hangs caused by Unreal Editor modal dialogs (for example
  Save/checkout confirmation popups) blocking interaction.
- Graph explosion from unbounded dependency/referencer expansion.
- Ambiguous SetCommand interpretation that treats MvvmButton command binding
  as BP EventGraph node work.
- Accidental programmatic save copied from example code during UMG/MVVM MCP
  work.
- Over-broad autonomous changes from delegated prompts such as "handle it" or
  equivalent phrasing in any language.

## Fast diagnosis

| Symptom | Likely cause | Next step |
|---|---|---|
| VibeUE MCP tools not visible, or only the offline tool list answers "Unreal Editor is not running" | Tool group not loaded yet, Unreal Editor not running, or Unreal's MCP server not started (Editor Preferences → Model Context Protocol → Auto Start Server, or console `ModelContextProtocol.StartServer`) | Re-run this host's MCP/tool discovery step (Step 0 in either skill); confirm the editor is open and interactive |
| MCP call hangs or times out (`-32000`) | Unreal Editor has a blocking modal (Save/checkout popup) | Tell the user to resolve the popup in the editor, then retry |
| Widget/Blueprint not found by name | Ambiguous or unresolved name-only input | Search the AssetRegistry with `execute_python_code`, disambiguate by folder/path if multiple `WidgetBlueprint` candidates exist |
| `add_view_model_binding` returns `False` | ViewModel alias missing, widget not found, or destination is a custom event | See `umg-mvvm-binding` "Common Failures" table |
| Binding applied but runtime value is wrong | Wrong binding mode chosen | Re-check the Binding Mode Matrix in `umg-mvvm-binding` |
| Field name / return type errors in Python | Using vendored-plugin C++ naming instead of the actual snake_case Python API | Check `vibeue-mcp-pitfalls.md` |
| Graph expansion returns too much / truncated | Depth/node limits hit | Report truncation; escalate depth only on an explicit full-graph request |

## Scope boundaries

- Skill workflow and routing: `../skills/umg-inspect-bind/SKILL.md` and
  `../skills/umg-mvvm-binding/SKILL.md`.
- Concrete request shapes and regression checks: `./maintenance-examples.md`.
- Exact API field names, return types, and known failure patterns:
  `./vibeue-mcp-pitfalls.md`.
- Operational contracts (path resolution, verification, autonomy rules):
  `./tool-contracts.md`.

This plugin only talks to VibeUE's MCP server over the network; it does not
vendor or maintain a copy of the VibeUE Unreal plugin source. A project that
vendors VibeUE inside its own repository may keep its own project-specific
setup/update runbook there — that runbook does not belong in this shared
plugin.
