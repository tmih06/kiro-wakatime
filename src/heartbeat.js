'use strict';

const os = require('os');
const child_process = require('child_process');
const config = require('./config');
const deps = require('./dependencies');
const state = require('./state');

const PLUGIN_VERSION = require('../package.json').version;

// kiro-cli tool names (and their aliases) that carry a file path we can map to
// a WakaTime entity.
const WRITE_TOOLS = new Set(['fs_write', 'write']);
const READ_TOOLS = new Set(['fs_read', 'read']);

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

// Recursively look for the first plausible filesystem path in a tool_input
// object. kiro tools use varied shapes (path, paths[], operations[].path, etc).
function findEntityPath(input) {
  if (input == null) return undefined;
  if (typeof input === 'string') {
    return input;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findEntityPath(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof input === 'object') {
    for (const key of ['path', 'file', 'file_path', 'filename', 'target']) {
      if (typeof input[key] === 'string' && input[key].trim()) {
        return input[key];
      }
    }
    for (const key of ['operations', 'paths', 'files']) {
      if (input[key] != null) {
        const found = findEntityPath(input[key]);
        if (found) return found;
      }
    }
  }
  return undefined;
}

// Translate a hook event into a heartbeat description, or null to skip.
function buildHeartbeat(event) {
  const toolName = event.tool_name;
  const cwd = event.cwd || process.cwd();

  let entity;
  let entityType = 'file';
  let isWrite = false;
  let category;
  let isAiWrite = false;

  if (toolName && (WRITE_TOOLS.has(toolName) || READ_TOOLS.has(toolName))) {
    entity = findEntityPath(event.tool_input);
    if (WRITE_TOOLS.has(toolName)) {
      isWrite = true;
      // Kiro CLI is an AI agent, so file writes are AI-authored code. Tag them
      // with the "ai coding" category when the CLI supports it (see buildArgs);
      // otherwise this resolves back to "coding".
      isAiWrite = true;
      category = 'ai coding';
    } else {
      category = 'code reviewing';
    }
  }

  // Fall back to a project-level "app" heartbeat keyed on the working dir so
  // prompt/spawn/stop events still register coding activity in the project.
  if (!entity) {
    entity = cwd;
    entityType = 'app';
    if (!category) {
      isAiWrite = true;
      category = 'ai coding';
    }
  }

  return { entity, entityType, isWrite, category, isAiWrite, projectFolder: cwd };
}

function quote(s) {
  return s;
}

// Estimate the number of lines an AI write added/changed, from the tool_input
// when the content is available. Returns undefined when it can't be determined.
function estimateAiLineChanges(input) {
  if (input == null || typeof input !== 'object') return undefined;
  const text =
    (typeof input.file_text === 'string' && input.file_text) ||
    (typeof input.new_str === 'string' && input.new_str) ||
    (typeof input.content === 'string' && input.content) ||
    undefined;
  if (typeof text !== 'string' || text.length === 0) return undefined;
  // count lines (at least 1 for non-empty content)
  return text.split('\n').length;
}

function buildArgs(hb, apiKey, event) {
  const editor = `kiro-cli/unknown kiro-wakatime/${PLUGIN_VERSION}`;
  const args = ['--entity', hb.entity, '--plugin', editor, '--time', String(Date.now() / 1000)];

  if (hb.entityType && hb.entityType !== 'file') {
    args.push('--entity-type', hb.entityType);
  }
  if (hb.isWrite) args.push('--write');

  // Resolve the category: "ai coding" is only valid on wakatime-cli 2.x+.
  // Fall back to "coding" on older CLIs so heartbeats aren't rejected.
  let category = hb.category;
  const aiCapable = deps.supportsAiCoding();
  if (hb.isAiWrite) {
    category = aiCapable ? 'ai coding' : 'coding';
  }
  if (category) args.push('--category', category);

  // When the CLI supports AI attribution and this is an AI file write, pass the
  // number of AI-authored lines so the dashboard can split human vs AI code.
  if (aiCapable && hb.isAiWrite && hb.isWrite && event) {
    const aiLines = estimateAiLineChanges(event.tool_input);
    if (typeof aiLines === 'number' && aiLines > 0) {
      args.push('--ai-line-changes', String(aiLines));
    }
  }

  if (hb.projectFolder) args.push('--project-folder', hb.projectFolder);
  if (apiKey) args.push('--key', apiKey);

  const apiUrl = config.getSetting('settings', 'api_url');
  if (apiUrl) args.push('--api-url', apiUrl);

  return args;
}

async function run() {
  const raw = await readStdin();

  let event = {};
  if (raw && raw.trim()) {
    try {
      event = JSON.parse(raw);
    } catch (e) {
      // Not JSON; treat as an empty/project-level event.
      event = {};
    }
  }

  const apiKey = config.getApiKey();
  if (!config.isApiKeyValid(apiKey)) {
    // No key yet: exit cleanly so we never block the agent. The user runs
    // `kiro-wakatime api-key` to set it.
    process.stderr.write(
      'kiro-wakatime: no WakaTime API key set. Run `kiro-wakatime api-key <key>`.\n',
    );
    return 0;
  }

  const hb = buildHeartbeat(event);
  const now = Date.now();

  if (!state.shouldSend({ entity: hb.entity, isWrite: hb.isWrite, now })) {
    return 0;
  }

  let binary;
  try {
    binary = await deps.ensureCli();
  } catch (e) {
    process.stderr.write(`kiro-wakatime: failed to install wakatime-cli: ${e.message}\n`);
    return 0;
  }

  const args = buildArgs(hb, apiKey, event);

  await new Promise((resolve) => {
    child_process.execFile(binary, args, { windowsHide: true }, (error, _stdout, stderr) => {
      if (error) {
        if (stderr) process.stderr.write(String(stderr));
        process.stderr.write(`kiro-wakatime: ${error.message}\n`);
      } else {
        state.recordSent({ entity: hb.entity, now });
      }
      resolve();
    });
  });

  return 0;
}

module.exports = { run, buildHeartbeat, findEntityPath };
