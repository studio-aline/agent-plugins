# Guidance plugin

The `guidance` plugin injects the X7 team's shared Claude model-selection and
workflow policy into every Claude Code session and subagent. It also includes
Codex routing guidance that applies only when the official OpenAI Codex plugin
is installed and enabled.

Install it directly when only the shared Claude guidance is needed:

```text
/plugin install guidance@agent-plugins
/reload-plugins
```

`fable-5.1` is available only on Max, Team Premium, and Enterprise plans. The
hook reads `oauthAccount` from `.claude.json` in `CLAUDE_CONFIG_DIR` or the home
directory. For Team Standard seats (`seatTier: team_standard`) and Pro plans, it
tells Claude to use `opus-5.5` instead of `fable-5.1`. If a `fable-5.1` call
fails as unavailable, Claude reruns it with `opus-5.5`.

For Codex routing, install and enable `codex@openai-codex` from
[OpenAI's Codex plugin marketplace](https://github.com/openai/codex-plugin-cc).
The X7 guidance plugin does not install it as a dependency. Without that plugin,
the Codex routing extension is inactive.
