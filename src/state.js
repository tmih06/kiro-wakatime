'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

// vscode-wakatime sends a heartbeat at most once every 2 minutes unless the
// file changes or it is a write. We persist the last heartbeat across hook
// invocations because each kiro-cli hook runs as a fresh process.
const TIME_BETWEEN_HEARTBEATS_MS = 120000;

function stateFile() {
  return path.join(config.getResourcesDir(), 'kiro-wakatime-state.json');
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch (e) {
    return { lastHeartbeatAt: 0, lastEntity: '' };
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(state));
  } catch (e) {
    // Non-fatal: throttling just degrades to per-event without persistence.
  }
}

// Decide whether enough has changed to warrant a new heartbeat.
function shouldSend({ entity, isWrite, now }) {
  if (isWrite) return true;
  const state = readState();
  if (state.lastEntity !== entity) return true;
  return now - (state.lastHeartbeatAt || 0) >= TIME_BETWEEN_HEARTBEATS_MS;
}

function recordSent({ entity, now }) {
  writeState({ lastHeartbeatAt: now, lastEntity: entity });
}

module.exports = {
  TIME_BETWEEN_HEARTBEATS_MS,
  shouldSend,
  recordSent,
};
