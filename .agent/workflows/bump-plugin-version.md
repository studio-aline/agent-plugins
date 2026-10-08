---
description: Bump plugin versions after modifying a plugin
---

Follow the `Plugin versioning` section of `AGENTS.md` for the request
accompanying this workflow invocation. For each plugin whose `plugins/<plugin>/`
files changed, increment the PATCH version in both
`.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` (when present),
keep them identical, update any test asserting the old version, and run
`npm test`. Do not commit or push unless the user asks.
