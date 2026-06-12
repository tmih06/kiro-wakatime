'use strict';

const config = require('./config');
const deps = require('./dependencies');
const setup = require('./setup');

const PKG = require('../package.json');

function printHelp() {
  process.stdout.write(
    `kiro-wakatime v${PKG.version} — WakaTime time tracking for Kiro CLI

Usage:
  kiro-wakatime <command> [options]

Commands:
  setup [--local] [--agent <name>] [--print]
                        Add WakaTime hooks to a Kiro agent config.
                        --agent  Agent name (default: "default").
                        --local  Write to ./.kiro/agents instead of ~/.kiro/agents.
                        --print  Print the hooks JSON snippet instead of writing.
  api-key [<key>]       Set or show your WakaTime API key (stored in ~/.wakatime.cfg).
  install-cli           Download/verify the wakatime-cli dependency.
  heartbeat             Process a hook event from STDIN (invoked by Kiro CLI).
  status                Show config, API key state, and wakatime-cli location.
  --version, -v         Print version.
  --help, -h            Show this help.

Quick start:
  npm install -g kiro-wakatime
  kiro-wakatime api-key <your-key-from-https://wakatime.com/api-key>
  kiro-wakatime setup
`,
  );
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--local') flags.local = true;
    else if (a === '--print') flags.print = true;
    else if (a === '--agent') flags.agent = args[++i];
    else positional.push(a);
  }
  return { flags, positional };
}

function cmdSetup(args) {
  const { flags } = parseFlags(args);
  if (flags.print) {
    process.stdout.write(setup.printSnippet() + '\n');
    return 0;
  }
  const name = flags.agent || 'default';
  const scope = flags.local ? 'local' : 'global';
  const { file, created } = setup.installToAgent(name, scope);
  process.stdout.write(
    `${created ? 'Created' : 'Updated'} agent config: ${file}\n` +
      `WakaTime hooks installed. Restart kiro-cli (or reselect the "${name}" agent) to activate.\n`,
  );
  if (!config.isApiKeyValid(config.getApiKey())) {
    process.stdout.write(
      '\nNo API key set yet. Run: kiro-wakatime api-key <your-key>\n' +
        'Get your key at https://wakatime.com/api-key\n',
    );
  }
  return 0;
}

function cmdApiKey(args) {
  const { positional } = parseFlags(args);
  const key = positional[0];
  if (!key) {
    const current = config.getApiKey();
    if (current) {
      const masked = current.slice(0, 9) + '...' + current.slice(-4);
      process.stdout.write(`Current API key: ${masked}\n`);
    } else {
      process.stdout.write('No API key set. Get one at https://wakatime.com/api-key\n');
    }
    return 0;
  }
  if (!config.isApiKeyValid(key)) {
    process.stderr.write('Invalid API key format. Expected a WakaTime UUID (optionally waka_ prefixed).\n');
    return 1;
  }
  config.setSetting('settings', 'api_key', key);
  process.stdout.write(`API key saved to ${config.getConfigFile()}\n`);
  return 0;
}

async function cmdInstallCli() {
  if (deps.getCliLocationGlobal()) {
    process.stdout.write(`Using wakatime-cli already on PATH: ${deps.getCliLocationGlobal()}\n`);
    return 0;
  }
  process.stdout.write('Downloading wakatime-cli...\n');
  try {
    const loc = await deps.installCli();
    process.stdout.write(`Installed wakatime-cli: ${loc}\n`);
    const v = deps.cliVersion();
    if (v) process.stdout.write(`Version: ${v}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`Failed: ${e.message}\n`);
    return 1;
  }
}

function cmdStatus() {
  const key = config.getApiKey();
  process.stdout.write(
    `kiro-wakatime v${PKG.version}\n` +
      `Config file:    ${config.getConfigFile()}\n` +
      `API key:        ${key ? (config.isApiKeyValid(key) ? 'set (valid format)' : 'set (INVALID format)') : 'not set'}\n` +
      `wakatime-cli:   ${deps.isCliInstalled() ? deps.getCliLocation() : 'not installed (will download on first heartbeat)'}\n` +
      `Global agents:  ${setup.globalAgentsDir()}\n`,
  );
  return 0;
}

async function main(argv) {
  const [command, ...rest] = argv;

  let code = 0;
  switch (command) {
    case 'heartbeat':
      code = await require('./heartbeat').run();
      break;
    case 'setup':
      code = cmdSetup(rest);
      break;
    case 'api-key':
    case 'apikey':
      code = cmdApiKey(rest);
      break;
    case 'install-cli':
      code = await cmdInstallCli();
      break;
    case 'status':
      code = cmdStatus();
      break;
    case '--version':
    case '-v':
      process.stdout.write(`${PKG.version}\n`);
      break;
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n`);
      printHelp();
      code = 1;
  }

  process.exitCode = code;
}

module.exports = { main };
