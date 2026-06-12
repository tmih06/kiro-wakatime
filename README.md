# kiro-wakatime

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

- Extracts the file path from `tool_input` for `fs_write`/`fs_read` events, and
  tags writes as `ai coding` and reads as `code reviewing`.
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

## License

BSD-3-Clause
