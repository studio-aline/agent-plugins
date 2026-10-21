# VibeUE Maintenance Examples

Prompt examples and regression checks for maintaining the `umg-inspect-bind`
and `umg-mvvm-binding` skills. Not the routing policy source — that lives in
each skill's own `SKILL.md`.

## Language Policy

- Skill and reference documents in this plugin are written in English.
- This file is an exception: Korean text is allowed in example prompts and
  regression cases, because real X7 requests to these skills are frequently
  in Korean, English, or mixed. All section headings and non-example prose
  stay in English.

## When to load this document

- Prompt quality tuning, routing behavior maintenance, and regression
  validation after editing either `SKILL.md`.
- Cross-language intent-routing checks.
- Not for runtime failure diagnosis (`./troubleshooting.md`) or exact API
  field names (`./vibeue-mcp-pitfalls.md`).

## Update Policy

When modifying either skill's `SKILL.md` or these references, check whether
this file needs updating too:

- New or changed intent-routing rule → update the Regression Checklist.
- New skill workflow step → add a matching regression check item.
- New observed failure pattern → add a Known Failure Pattern entry below.
- Removed or renamed files/sections → fix or remove references here.

## Example Request Shapes

- "questviewbp 의 hierarchy 정보 다 가져와봐. 다른 bp 참조도 전부 풀어서"
- "questviewbp 에서 특정 button 에 SetCommand 넣어줘 QuestPopupViewModel 에 있는 무엇무엇을"
- "지금 올려준 텍스트에 bp 랑 필요한 binding 있으니까 알아서 탐색해서 필요한 경우에 넣어줘. 예시는 questviewbp 를 참고하고."
- "Get full hierarchy for QuestViewBP, expand related Blueprint references, and apply missing bindings from the provided spec."

## Intent Mapping Targets

1. InspectGraph (read-only): resolve BP path → collect hierarchy snapshot →
   expand dependency/referencer graph only if explicitly requested.
2. ApplyBinding (mutation): preflight inspect → build binding plan → upsert
   bindings → compile/report → tell the user to save in the editor if
   persistence is needed.
3. SpecDrivenAutopatch (semi-autonomous): parse a provided text spec → infer
   scoped missing work → apply minimal safe deltas.

## Regression Checklist

- [ ] Same intent routes correctly across Korean/English/mixed prompts.
- [ ] Proper nouns (asset/widget/ViewModel/property names) are preserved
      exactly, never translated or reformatted.
- [ ] Ambiguous targets trigger one focused clarification, not guesswork.
- [ ] Graph expansion respects depth/node limits and reports truncation when
      hit.
- [ ] Mutation path reports applied vs skipped actions.
- [ ] Step 0 (activate VibeUE MCP tools) ran before any other action, using
      this host's own tool-discovery mechanism.
- [ ] Agent did NOT fall back to manual `.uasset` inspection when MCP tools
      appeared unavailable.
- [ ] UMG/MVVM mutation path did NOT call `save_asset`,
      or `save_all_assets` as routine
      finalization.
- [ ] UMG/MVVM mutation path compiled the Blueprint, reported errors/warnings,
      and told the user to save in the editor if persistence is needed.
- [ ] Binding-only requests skipped dependency/referencer expansion unless
      explicitly requested.
- [ ] "알아서"/"handle it"-style requests applied only unambiguous missing
      ViewModel aliases and MVVM bindings.
- [ ] MvvmButton SetCommand was treated as a normal MVVM command binding, not
      BP EventGraph work, and did not invent a OneWay/TwoWay mode for it.
- [ ] BP EventGraph node wiring occurred only when explicitly requested.

## Known Failure Pattern — skill body must be self-contained, not a bare pointer

**Observed failure (source: X7 game repo's local VibeUE integration, before
this plugin existed):** `SKILL.md` was a one-line `@`-style include pointing
at a separate detailed skill file. Some agents/models read the one-liner but
did not automatically follow the include with a second file read. Those
agents had no actual skill content, never activated the VibeUE MCP tools, and
fell back to `file_search` + raw Python `open(.uasset, 'rb')` byte-parsing —
producing partial binary string extraction instead of a proper widget/MVVM
snapshot.

**Root causes:**

1. A bare `@`-style pointer only works for agents that auto-chain a follow-up
   file read; it silently produces zero content for agents that do not.
2. The routing/index layer mentioned the Unreal Editor prerequisite but never
   stated that binary fallback parsing is forbidden.
3. There was no explicit "activate MCP tools first" step in the load path.

**Fix applied in this plugin:** both `umg-inspect-bind/SKILL.md` and
`umg-mvvm-binding/SKILL.md` are self-contained — the full workflow, MCP
activation step, and fallback-forbidden rule live directly in the frontmatter
body, not behind an include a host might not follow.
