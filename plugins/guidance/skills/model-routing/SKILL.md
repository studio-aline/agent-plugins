---
name: model-routing
description: Shared team policy for selecting Claude models and routing work across workflows and subagents
user-invocable: false
---

# Team Claude model-routing policy

Rankings are defaults, not hard limits; higher scores are better. Cost reflects
the team's effective cost rather than public list price. Intelligence measures
how difficult a problem can be delegated unsupervised. Taste covers UI/UX, code
quality, API design, and copy.

| model        | cost | intelligence | taste |
| ------------ | ---: | -----------: | ----: |
| `haiku-5.5`  |   10 |            3 |     4 |
| `sonnet-5.5` |    5 |            5 |     7 |
| `opus-5.5`   |    4 |            7 |     8 |
| `fable-5.1`  |    2 |            9 |     9 |

The `haiku-5.5` scores are estimates, not measurements. Adjust them when team
experience provides better evidence.

## Selection rules

- These are defaults, not limits. If a cheaper model's result does not meet the
  bar, rerun or redo the work with a stronger model without asking merely to
  escalate model quality. Judge the output, not the price tag.
- For anything that ships, resolve conflicts using intelligence, then taste,
  then cost.
- User-facing UI, copy, and API design require taste 7 or higher.
- Review plans and implementations with `fable-5.1` (if eligible) or `opus-5.5`.
- Select `haiku-5.5` only for mechanical, easily verified, cheaply rerunnable
  delegation: read-only search and exploration fan-out, summarizing files, logs,
  or diffs, classification, extraction, format conversion, and bulk repetitive
  edits. If the result misses the bar, rerun with `sonnet-5.5`.
- Never select `haiku-5.5` for work that ships, plan or implementation reviews,
  ambiguous requirements, or high-risk changes such as security or migrations.
- Claude models run through the Agent or Workflow model parameter.

## Fable availability

`fable-5.1` is available only on Max, Team Premium, and Enterprise plans. Check
the account's eligibility before selecting it. This check overrides every rule
above, including intelligence-first selection and review recommendations.

- The guidance hook injects a `Fable eligibility for this account:` line. If it
  says `ineligible`, never select `fable-5.1`; use `opus-5.5` instead.
- If that line is missing, run `claude auth status --json` and read
  `subscriptionType`. Treat `pro` or `free` as ineligible. For `team`, read
  `oauthAccount.seatTier` from `.claude.json` in `CLAUDE_CONFIG_DIR` or the home
  directory; `team_standard` is ineligible.
- If an Agent or Workflow call with `fable-5.1` fails because the model is
  unavailable or not permitted, rerun it with `opus-5.5`.

This policy may be extended by other enabled plugins. Treat extension rules as
additional routing options; they do not replace these quality requirements.
