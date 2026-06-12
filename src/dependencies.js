'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const child_process = require('child_process');
const AdmZip = require('adm-zip');
const config = require('./config');

const GITHUB_DOWNLOAD_URL = 'https://github.com/wakatime/wakatime-cli/releases/latest/download';

function osName() {
  let name = os.platform();
  if (name === 'win32') name = 'windows';
  return name;
}

function architecture() {
  const arch = os.arch();
  if (arch.indexOf('32') > -1) return '386';
  if (arch.indexOf('x64') > -1) return 'amd64';
  return arch;
}

function isWindows() {
  return os.platform() === 'win32';
}

// Look for a wakatime-cli already on PATH; honor it if present (matches
// vscode-wakatime, lets users manage their own CLI install).
function getCliLocationGlobal() {
  const binaryName = `wakatime-cli${isWindows() ? '.exe' : ''}`;
  const pathEnv = process.env.PATH || '';
  const sep = isWindows() ? ';' : ':';
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    const candidate = path.join(dir, binaryName);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (e) {
      // keep looking
    }
  }
  return undefined;
}

function getCliLocation() {
  const global = getCliLocationGlobal();
  if (global) return global;
  const ext = isWindows() ? '.exe' : '';
  const binary = `wakatime-cli-${osName()}-${architecture()}${ext}`;
  return path.join(config.getResourcesDir(), binary);
}

function isCliInstalled() {
  return fs.existsSync(getCliLocation());
}

function cliDownloadUrl() {
  return `${GITHUB_DOWNLOAD_URL}/wakatime-cli-${osName()}-${architecture()}.zip`;
}

function downloadFile(url, outputFile) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outputFile);
    const request = (currentUrl, redirects) => {
      if (redirects > 10) {
        reject(new Error('Too many redirects'));
        return;
      }
      https
        .get(currentUrl, { headers: { 'User-Agent': 'github.com/wakatime/kiro-wakatime' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            request(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Download failed (HTTP ${res.statusCode}) for ${currentUrl}`));
            return;
          }
          res.pipe(out);
          out.on('finish', () => out.close(resolve));
        })
        .on('error', (e) => {
          fs.unlink(outputFile, () => reject(e));
        });
    };
    request(url, 0);
  });
}

function extractCli(zipFile, dest) {
  const zip = new AdmZip(zipFile);
  zip.extractAllTo(dest, true);
  fs.unlinkSync(zipFile);

  const cli = getCliLocation();
  if (!isWindows()) {
    try {
      fs.chmodSync(cli, 0o755);
    } catch (e) {
      // best effort
    }
    // Create the unversioned `wakatime-cli` symlink some tooling expects.
    const link = path.join(config.getResourcesDir(), 'wakatime-cli');
    try {
      if (fs.existsSync(link)) fs.unlinkSync(link);
      fs.symlinkSync(cli, link);
    } catch (e) {
      try {
        fs.copyFileSync(cli, link);
        fs.chmodSync(link, 0o755);
      } catch (e2) {
        // non-fatal
      }
    }
  }
}

async function installCli() {
  const dest = config.getResourcesDir();
  const zipFile = path.join(dest, `wakatime-cli-${Date.now()}.zip`);
  await downloadFile(cliDownloadUrl(), zipFile);
  extractCli(zipFile, dest);
  return getCliLocation();
}

// Ensure a usable CLI exists, downloading if necessary. Returns its path.
async function ensureCli() {
  if (isCliInstalled()) return getCliLocation();
  return installCli();
}

function cliVersion() {
  try {
    const out = child_process.execFileSync(getCliLocation(), ['--version'], {
      encoding: 'utf8',
    });
    return out.trim();
  } catch (e) {
    return undefined;
  }
}

module.exports = {
  osName,
  architecture,
  isWindows,
  getCliLocation,
  getCliLocationGlobal,
  isCliInstalled,
  cliDownloadUrl,
  installCli,
  ensureCli,
  cliVersion,
};
