'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate WAKATIME_HOME so we never touch the real config during tests.
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-waka-test-'));
process.env.WAKATIME_HOME = tmpHome;

let failures = 0;
function check(name, fn) {
  try {
    fn();
    process.stdout.write(`ok   ${name}\n`);
  } catch (e) {
    failures++;
    process.stdout.write(`FAIL ${name}: ${e.message}\n`);
  }
}

const config = require('../src/config');
const state = require('../src/state');
const setup = require('../src/setup');
const heartbeat = require('../src/heartbeat');

check('api key round-trips through cfg', () => {
  const key = '12345678-1234-1234-1234-123456789abc';
  config.setSetting('settings', 'api_key', key);
  assert.strictEqual(config.getApiKey(), key);
  assert.ok(config.isApiKeyValid(key));
  assert.ok(!config.isApiKeyValid('nope'));
});

check('config preserves other sections on write', () => {
  config.setSetting('settings', 'api_url', 'https://example.com/api');
  assert.strictEqual(config.getSetting('settings', 'api_url'), 'https://example.com/api');
  // api_key from previous test still present
  assert.ok(config.getApiKey());
});

check('findEntityPath digs file path out of tool_input shapes', () => {
  assert.strictEqual(heartbeat.findEntityPath({ path: '/a/b.js' }), '/a/b.js');
  assert.strictEqual(heartbeat.findEntityPath({ file_path: '/c.js' }), '/c.js');
  assert.strictEqual(
    heartbeat.findEntityPath({ operations: [{ mode: 'Line', path: '/d.md' }] }),
    '/d.md',
  );
  assert.strictEqual(heartbeat.findEntityPath({ nothing: 1 }), undefined);
});

check('buildHeartbeat maps fs_write to a write + ai coding file heartbeat', () => {
  const hb = heartbeat.buildHeartbeat({
    tool_name: 'fs_write',
    tool_input: { path: '/proj/x.js' },
    cwd: '/proj',
  });
  assert.strictEqual(hb.entity, '/proj/x.js');
  assert.strictEqual(hb.entityType, 'file');
  assert.strictEqual(hb.isWrite, true);
  assert.strictEqual(hb.category, 'ai coding');
});

check('buildHeartbeat falls back to project app heartbeat', () => {
  const hb = heartbeat.buildHeartbeat({ tool_name: 'execute_bash', cwd: '/proj' });
  assert.strictEqual(hb.entity, '/proj');
  assert.strictEqual(hb.entityType, 'app');
});

check('throttle: writes always send, reads throttle by time + entity', () => {
  const now = Date.now();
  assert.ok(state.shouldSend({ entity: '/f.js', isWrite: true, now }));
  state.recordSent({ entity: '/f.js', now });
  // same entity, read, immediately after → throttled
  assert.ok(!state.shouldSend({ entity: '/f.js', isWrite: false, now: now + 1000 }));
  // different entity → sends
  assert.ok(state.shouldSend({ entity: '/g.js', isWrite: false, now: now + 1000 }));
  // same entity but past the 2-min window → sends
  assert.ok(
    state.shouldSend({
      entity: '/f.js',
      isWrite: false,
      now: now + state.TIME_BETWEEN_HEARTBEATS_MS + 1,
    }),
  );
});

check('mergeHooks adds our hooks without dropping user hooks', () => {
  const existing = {
    preToolUse: [{ matcher: 'execute_bash', command: 'echo hi' }],
    postToolUse: [{ matcher: 'fs_write', command: 'cargo fmt' }],
  };
  const merged = setup.mergeHooks(existing);
  // user's preToolUse preserved
  assert.strictEqual(merged.preToolUse.length, 1);
  // postToolUse now has user's cargo fmt + our two hooks
  assert.strictEqual(merged.postToolUse.length, 3);
  assert.ok(merged.userPromptSubmit.some((h) => h.command === setup.HOOK_COMMAND));
  assert.ok(merged.stop.some((h) => h.command === setup.HOOK_COMMAND));
});

check('mergeHooks is idempotent', () => {
  const once = setup.mergeHooks({});
  const twice = setup.mergeHooks(once);
  assert.deepStrictEqual(once, twice);
});

check('installToAgent writes a valid agent json with hooks', () => {
  process.env.HOME = tmpHome; // global agents dir derives from homedir
  const { file, created } = setup.installToAgent('default', 'global');
  assert.ok(created);
  assert.ok(fs.existsSync(file));
  const agent = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(agent.name, 'default');
  assert.ok(agent.hooks.postToolUse.some((h) => h.matcher === 'fs_write'));
});

process.stdout.write(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
