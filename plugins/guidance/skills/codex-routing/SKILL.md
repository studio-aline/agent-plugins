---
name: codex-routing
description: Route Codex work through OpenAI's official Claude Code plugin when it is installed and enabled.
---

# Codex routing extension

## Applicability

Apply this extension only in Claude Code when `codex@openai-codex` is installed
and enabled, and the session exposes its `/codex:rescue`, `/codex:review`, and
`/codex:adversarial-review` commands and lists `codex:codex-rescue` in `/agents`.
If the plugin, commands, or subagent are unavailable, ignore this extension and
follow `model-routing` alone. The OpenAI plugin loads its internal skills within
its own workflow; do not require those skills to appear in the main session.
Do not substitute a local Codex CLI command or the removed X7 Codex MCP server.
See [OpenAI's Codex plugin for Claude Code](https://github.com/openai/codex-plugin-cc)
for its current commands and bundled skills.

This extension is Claude Code-specific. It is not published for Codex or
Antigravity because the required OpenAI plugin targets Claude Code.

## Model selection

Rankings are defaults, not hard limits; higher scores are better. Cost reflects
the team's effective cost rather than public list price. Intelligence measures
how difficult a problem can be delegated unsupervised. Taste covers UI/UX, code
quality, API design, and copy.

| model         | cost | intelligence | taste |
| ------------- | ---: | -----------: | ----: |
| `gpt-6-luna`  |   10 |            5 |     4 |
| `gpt-6.1-sol` |    4 |            7 |     8 |
| `gpt-6-astra` |    2 |            9 |     9 |

The `gpt-6-astra` and `gpt-6.1-sol` scores are estimates, not measurements.
Adjust them when team experience provides better evidence.

- Use `gpt-6-luna` for bulk or mechanical work when the user requests a model
  choice and the installed Codex runtime supports it.
- Use Codex as an additional independent perspective for plan and implementation
  reviews when useful.
- Follow the OpenAI plugin's model and effort controls. Leave them unset unless
  the user explicitly selects them, and verify model support before passing a
  requested model.

## Operations

- `/codex:rescue` delegates investigation, planning, research, diagnosis, or
  implementation through the `codex:codex-rescue` subagent. That subagent uses
  `codex-cli-runtime` and `gpt-5-4-prompting` internally; let it handle those
  skills rather than invoking them directly from the main session.
- `/codex:review` runs a normal read-only code review; use it for uncommitted
  changes or a branch comparison.
- `/codex:adversarial-review` runs a read-only challenge review focused on
  assumptions, tradeoffs, and risks.
- Follow the `codex-result-handling` contract when presenting results. Preserve
  the evidence and findings structure. If a review finds issues, report them,
  ask which ones the user wants fixed, and stop; do not fix them as part of the
  review. If there are no findings, say so and keep the residual-risk note
  brief.

## Delegation safety

- Preserve the user's task text when forwarding it. Follow the upstream runtime
  skill's one-call, model, effort, and write-access rules.
- Use the official plugin's commands and skills; do not hand-write `codex exec`
  commands or bypass the plugin's normal permission prompts.
- A request to review, diagnose, investigate, or research remains read-only.
  Only delegate implementation when the user asks for changes.
