'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// The command kiro-cli runs on each hook event. `kiro-wakatime` must be on
// PATH (npm global install) for this to resolve.
const HOOK_COMMAND = 'kiro-wakatime heartbeat';

// Triggers we attach to. fs_write/fs_read carry file paths; userPromptSubmit
// and stop give us project-level activity at turn boundaries.
function wakatimeHooks() {
  return {
    postToolUse: [
      { matcher: 'fs_write', command: HOOK_COMMAND },
      { matcher: 'fs_read', command: HOOK_COMMAND },
    ],
    userPromptSubmit: [{ command: HOOK_COMMAND }],
    stop: [{ command: HOOK_COMMAND }],
  };
}

function globalAgentsDir() {
  return path.join(os.homedir(), '.kiro', 'agents');
}

function localAgentsDir() {
  return path.join(process.cwd(), '.kiro', 'agents');
}

function agentPath(name, scope) {
  const dir = scope === 'local' ? localAgentsDir() : globalAgentsDir();
  return path.join(dir, `${name}.json`);
}

// True if a hook array already contains our command (so re-runs are idempotent).
function hasOurCommand(arr) {
  return Array.isArray(arr) && arr.some((h) => h && h.command === HOOK_COMMAND);
}

// Merge our hooks into an existing hooks object without clobbering the user's.
function mergeHooks(existing) {
  const merged = Object.assign({}, existing);
  const ours = wakatimeHooks();
  for (const trigger of Object.keys(ours)) {
    const current = Array.isArray(merged[trigger]) ? merged[trigger].slice() : [];
    for (const hook of ours[trigger]) {
      const dup = current.some(
        (h) => h && h.command === hook.command && (h.matcher || '') === (hook.matcher || ''),
      );
      if (!dup) current.push(hook);
    }
    merged[trigger] = current;
  }
  return merged;
}

function readAgent(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw new Error(`Could not parse agent config ${file}: ${e.message}`);
  }
}

// Inject hooks into a named agent config, creating a minimal one if absent.
function installToAgent(name, scope) {
  const file = agentPath(name, scope);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  let agent = readAgent(file);
  const created = agent === null;
  if (created) {
    agent = {
      name,
      description: `${name} (WakaTime time tracking enabled)`,
    };
  }

  agent.hooks = mergeHooks(agent.hooks || {});
  fs.writeFileSync(file, JSON.stringify(agent, null, 2) + '\n');

  return { file, created };
}

function printSnippet() {
  const snippet = { hooks: wakatimeHooks() };
  return JSON.stringify(snippet, null, 2);
}

module.exports = {
  HOOK_COMMAND,
  wakatimeHooks,
  mergeHooks,
  installToAgent,
  printSnippet,
  globalAgentsDir,
  localAgentsDir,
  agentPath,
};
