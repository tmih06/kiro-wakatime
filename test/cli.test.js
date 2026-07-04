#!/usr/bin/env node
'use strict';

// End-to-end CLI smoke test: runs the actual bin against an isolated
// temp HOME so every command path is exercised without touching the
// real ~/.wakatime.cfg or ~/.kiro. Verifies exit codes and key output.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BIN = path.resolve(__dirname, '..', 'bin', 'kiro-wakatime.js');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-cli-'));
const env = { ...process.env, HOME, USERPROFILE: HOME, WAKATIME_HOME: HOME };

let failures = 0;

function run(args, stdin) {
  return spawnSync(process.execPath, [BIN, ...args], {
    env,
    input: stdin || '',
    encoding: 'utf8',
  });
}

function check(name, fn) {
  try {
    fn();
    process.stdout.write(`ok   ${name}\n`);
  } catch (err) {
    failures++;
    process.stderr.write(`FAIL ${name}\n     ${err.message}\n`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

check('--version prints a semver', () => {
  const r = run(['--version']);
  assert(r.status === 0, `exit ${r.status}`);
  assert(/^\d+\.\d+\.\d+/.test(r.stdout.trim()), `bad version: ${r.stdout}`);
});

check('--help prints usage', () => {
  const r = run(['--help']);
  assert(r.status === 0, `exit ${r.status}`);
  assert(/Usage:/.test(r.stdout), 'missing Usage');
  assert(/heartbeat/.test(r.stdout), 'missing commands');
});

check('no args prints help', () => {
  const r = run([]);
  assert(r.status === 0, `exit ${r.status}`);
  assert(/Usage:/.test(r.stdout), 'missing Usage');
});

check('unknown command exits 1', () => {
  const r = run(['bogus']);
  assert(r.status === 1, `exit ${r.status}`);
  assert(/Unknown command/.test(r.stderr), 'missing error');
});

check('setup --print emits hooks JSON', () => {
  const r = run(['setup', '--print']);
  assert(r.status === 0, `exit ${r.status}`);
  const json = JSON.parse(r.stdout);
  assert(json.hooks, 'no hooks key');
  assert(Array.isArray(json.hooks.postToolUse), 'no postToolUse');
});

check('api-key rejects invalid format', () => {
  const r = run(['api-key', 'not-a-key']);
  assert(r.status === 1, `exit ${r.status}`);
  assert(/Invalid API key/.test(r.stderr), 'missing error');
});

check('api-key accepts and stores a valid uuid', () => {
  const key = 'waka_11111111-2222-3333-4444-555555555555';
  const r = run(['api-key', key]);
  assert(r.status === 0, `exit ${r.status}`);
  const cfg = fs.readFileSync(path.join(HOME, '.wakatime.cfg'), 'utf8');
  assert(cfg.includes(key), 'key not persisted to cfg');
});

check('api-key with no arg shows masked key', () => {
  const r = run(['api-key']);
  assert(r.status === 0, `exit ${r.status}`);
  assert(/Current API key:/.test(r.stdout), 'missing masked key');
});

check('status reports config + key state', () => {
  const r = run(['status']);
  assert(r.status === 0, `exit ${r.status}`);
  assert(/API key:\s+set \(valid format\)/.test(r.stdout), `unexpected: ${r.stdout}`);
});

check('setup --local writes agent config with hooks', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-proj-'));
  const r = spawnSync(process.execPath, [BIN, 'setup', '--local'], {
    env,
    cwd,
    encoding: 'utf8',
  });
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`);
  const agentFile = path.join(cwd, '.kiro', 'agents', 'default.json');
  assert(fs.existsSync(agentFile), 'agent file not created');
  const agent = JSON.parse(fs.readFileSync(agentFile, 'utf8'));
  assert(agent.hooks && agent.hooks.postToolUse, 'hooks not written');
});

check('heartbeat always exits 0 even with empty stdin', () => {
  // Isolated keyless HOME so it exits at the "no API key" guard without
  // attempting to download wakatime-cli. The hook must never block the agent.
  const keylessHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-nokey-'));
  const r = spawnSync(process.execPath, [BIN, 'heartbeat'], {
    env: { ...process.env, HOME: keylessHome, USERPROFILE: keylessHome, WAKATIME_HOME: keylessHome },
    input: '{}',
    encoding: 'utf8',
  });
  fs.rmSync(keylessHome, { recursive: true, force: true });
  assert(r.status === 0, `exit ${r.status}`);
});

// cleanup best-effort
try { fs.rmSync(HOME, { recursive: true, force: true }); } catch (_) {}

if (failures) {
  process.stderr.write(`\n${failures} CLI check(s) failed\n`);
  process.exit(1);
}
process.stdout.write('\nALL CLI CHECKS PASS\n');
