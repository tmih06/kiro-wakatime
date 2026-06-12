'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Resolves the WakaTime home directory, honoring WAKATIME_HOME like wakatime-cli.
function getWakaHome() {
  const fromEnv = process.env.WAKATIME_HOME;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return os.homedir();
}

function getConfigFile() {
  return path.join(getWakaHome(), '.wakatime.cfg');
}

function getResourcesDir() {
  const dir = path.join(getWakaHome(), '.wakatime');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Minimal INI parser preserving sections. wakatime.cfg is a flat INI of
// [section] then key = value lines.
function parse(contents) {
  const sections = {};
  let current = null;
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      current = sectionMatch[1].trim();
      if (!sections[current]) sections[current] = {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1 || current === null) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    sections[current][key] = value;
  }
  return sections;
}

function read() {
  const file = getConfigFile();
  try {
    return parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

function serialize(sections) {
  const blocks = [];
  for (const section of Object.keys(sections)) {
    const lines = [`[${section}]`];
    for (const key of Object.keys(sections[section])) {
      lines.push(`${key} = ${sections[section][key]}`);
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n') + '\n';
}

function getSetting(section, key) {
  const sections = read();
  if (sections[section] && Object.prototype.hasOwnProperty.call(sections[section], key)) {
    return sections[section][key];
  }
  return undefined;
}

function setSetting(section, key, value) {
  const sections = read();
  if (!sections[section]) sections[section] = {};
  sections[section][key] = value;
  fs.writeFileSync(getConfigFile(), serialize(sections), { mode: 0o600 });
}

// API key resolution mirrors wakatime-cli precedence: env var wins, then cfg.
function getApiKey() {
  const fromEnv = process.env.WAKATIME_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const fromCfg = getSetting('settings', 'api_key');
  return fromCfg && fromCfg.trim() ? fromCfg.trim() : undefined;
}

const API_KEY_RE = /^(waka_)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isApiKeyValid(key) {
  return typeof key === 'string' && API_KEY_RE.test(key.trim());
}

module.exports = {
  getWakaHome,
  getConfigFile,
  getResourcesDir,
  getApiKey,
  getSetting,
  setSetting,
  isApiKeyValid,
};
