# kiro-wakatime

[![CI](https://github.com/tmih06/kiro-wakatime/actions/workflows/ci.yml/badge.svg)](https://github.com/tmih06/kiro-wakatime/actions/workflows/ci.yml)

[WakaTime](https://wakatime.com) time tracking for **Kiro CLI** (`kiro-cli`).

Kiro CLI doesn't have an editor-extension API like VS Code, but it does have an
[agent hooks](https://kiro.dev/docs/cli/hooks/) system. This plugin registers
hooks that fire on file reads/writes, prompt submissions, and turn completions.
Each hook invokes `kiro-wakatime heartbeat`, which translates the event into a
WakaTime heartbeat and sends it via the official
[`wakatime-cli`](https://github.com/wakatime/wakatime-cli) (downloaded
automatically on first use).

## Install

```bash
npm install -g kiro-wakatime
```

## Setup

1. Get your API key from https://wakatime.com/api-key
2. Save it:
   ```bash
   kiro-wakatime api-key <your-api-key>
   ```
3. Install the hooks into your Kiro agent:
   ```bash
   kiro-wakatime setup
   ```
4. Restart `kiro-cli` (or reselect the agent). Code normally — your activity
   shows up at https://wakatime.com/dashboard.

That's it. The `wakatime-cli` binary is downloaded to `~/.wakatime/` on the
first heartbeat if it isn't already on your `PATH`.

## How it works

`kiro-wakatime setup` merges the following into your agent config
(`~/.kiro/agents/default.json` by default), preserving any hooks you already
have:

```json
{
  "hooks": {
    "postToolUse": [
      { "matcher": "fs_write", "command": "kiro-wakatime heartbeat" },
      { "matcher": "fs_read",  "command": "kiro-wakatime heartbeat" }
    ],
    "userPromptSubmit": [{ "command": "kiro-wakatime heartbeat" }],
    "stop": [{ "command": "kiro-wakatime heartbeat" }]
  }
}
```

On each event, Kiro CLI pipes a JSON payload to `kiro-wakatime heartbeat` over
STDIN. The plugin:

- Extracts the file path from `tool_input` for `fs_write`/`fs_read` events.
  Because Kiro CLI is an AI agent, writes are tagged as `ai coding` and reads
  as `code reviewing`. The `ai coding` category and per-write AI line counts
  (`--ai-line-changes`) require wakatime-cli 2.x; on older CLIs the plugin
  automatically falls back to the `coding` category so heartbeats still send.
- Falls back to a project-level (`app`) heartbeat keyed on `cwd` for prompt and
  stop events, so activity still registers even without a file in context.
- Throttles to at most one heartbeat per file every 2 minutes (writes always
  send), matching the official WakaTime plugins. State persists in
  `~/.wakatime/kiro-wakatime-state.json` across hook invocations.
- Shells out to `wakatime-cli`, which handles offline queuing, project
  detection, and the API call.

The hook always exits `0`, so it can never block your agent.

## Commands

| Command | Description |
| --- | --- |
| `kiro-wakatime setup [--local] [--agent <name>] [--print]` | Install hooks into an agent config. `--local` writes to `./.kiro/agents`, `--print` just prints the snippet. |
| `kiro-wakatime api-key [<key>]` | Set or show your API key (stored in `~/.wakatime.cfg`). |
| `kiro-wakatime install-cli` | Download/verify `wakatime-cli`. |
| `kiro-wakatime status` | Show config, API key state, and CLI location. |
| `kiro-wakatime heartbeat` | Process a hook event from STDIN (invoked by Kiro CLI, not by you). |

## Configuration

Settings live in the standard WakaTime INI file at `~/.wakatime.cfg`:

```ini
[settings]
api_key = waka_xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
api_url = https://api.wakatime.com/api/v1
```

The `WAKATIME_API_KEY` and `WAKATIME_HOME` environment variables are also
honored, matching `wakatime-cli` behavior.

## Privacy

WakaTime plugins collect file paths and project names. See WakaTime's
[data collection docs](https://wakatime.com/faq) and
[file obfuscation options](https://wakatime.com/faq#hide-filenames) to redact
file names if needed (configure via `~/.wakatime.cfg`).

## Development

```bash
npm install      # install dev/runtime deps
npm run lint     # syntax-check every JS file (node --check)
npm test         # unit smoke tests (test/smoke.js)
npm run test:cli # end-to-end CLI tests against an isolated temp HOME
npm run test:all # lint + unit + CLI
```

CI runs on every push and pull request across Node 18/20/22 (plus a macOS and
Windows sanity check) and verifies the package builds via `npm pack`.

## Releasing

Publishing to npm is automated via **[npm Trusted Publishing (OIDC)](https://docs.npmjs.com/trusted-publishers)** —
no npm token is stored in the repo. GitHub mints a short-lived,
workflow-scoped credential at publish time, and provenance is generated
automatically.

**One-time setup** on npmjs.com → your package → Settings → Trusted Publisher:

- Publisher: **GitHub Actions**
- Organization or user: `tmih06`
- Repository: `kiro-wakatime`
- Workflow filename: `publish.yml`

(Optional, recommended afterward: set Publishing access to
"Require two-factor authentication and disallow tokens" for maximum security.)

**To cut a release**, bump the version and push a matching tag:

```bash
npm version patch   # or minor / major — updates package.json and creates a tag
git push && git push --tags
```

The `Publish` workflow triggers on version tags (`v1.2.3` or `1.2.3`), verifies
the tag matches `package.json`, re-runs lint/tests, and publishes via OIDC.

## License

BSD-3-Clause
