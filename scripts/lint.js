#!/usr/bin/env node
'use strict';

// Dependency-free lint: syntax-check every JS file with `node --check`.
// Keeps CI meaningful without pulling in an ESLint toolchain.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['bin', 'src', 'test', 'scripts'];

function walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = DIRS
  .map((d) => path.join(ROOT, d))
  .filter((d) => fs.existsSync(d))
  .flatMap(walk);

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    process.stdout.write(`ok   ${path.relative(ROOT, file)}\n`);
  } catch (err) {
    failed++;
    process.stderr.write(`FAIL ${path.relative(ROOT, file)}\n`);
    process.stderr.write(String(err.stderr || err.message) + '\n');
  }
}

if (failed) {
  process.stderr.write(`\nlint: ${failed} file(s) failed to parse\n`);
  process.exit(1);
}
process.stdout.write(`\nlint: ${files.length} JS file(s) parse OK\n`);
