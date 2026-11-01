/**
 * Local SSH config discovery: list the hosts the user already configured so the
 * panel can offer them in a dropdown, and merge them with explicit host rows.
 * `ssh <alias>` then reuses the user's own User/Port/IdentityFile/agent setup.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FIRST_WINS = ['hostname', 'user', 'port', 'identityfile'];

/** Parse an ssh_config document into concrete alias entries (wildcards skipped). */
export function parseSshConfig(text) {
  const hosts = [];
  const defaults = {};
  let block = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [keyword, ...rest] = line.split(/\s+/);
    const key = keyword.toLowerCase();
    if (key === 'host') {
      block = { patterns: rest, options: {} };
      if (rest.includes('*')) {
        block = { defaults: true, options: {} };
      }
      hosts.push(block);
      continue;
    }
    if (block === null || block.options === undefined) continue;
    if (!FIRST_WINS.includes(key) || block.options[key] !== undefined) continue;
    block.options[key] = rest.join(' ');
  }
  const globalDefaults = {};
  for (const entry of hosts) if (entry.defaults) Object.assign(globalDefaults, entry.options);
  const result = [];
  for (const entry of hosts) {
    if (entry.defaults) continue;
    for (const alias of entry.patterns) {
      if (alias === '' || /[*?!]/.test(alias)) continue;
      const options = { ...globalDefaults, ...entry.options };
      result.push({
        alias,
        hostName: options.hostname,
        user: options.user,
        port: options.port === undefined ? undefined : Number(options.port),
        identityFile: options.identityfile,
      });
    }
  }
  return result;
}

/** Read the user's ssh_config; a missing or unreadable file yields no hosts. */
export function readSshConfig(path = join(homedir(), '.ssh', 'config')) {
  try {
    return parseSshConfig(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Explicit profile rows win over discovered aliases with the same id; every other
 * discovered alias falls back to the deployment defaults, including the default
 * web profile/port used by the tunneled Web UI.
 */
export function mergeHosts({ configured = [], discovered = [], defaults = {}, ignore = [] }) {
  const ignored = new Set(ignore);
  const allowed = discovered.filter((entry) => !ignored.has(entry.alias));
  const rows = configured.map((row) => ({
    id: row.id,
    ssh: row.ssh,
    label: row.label ?? row.id,
    dshCommand: row.dshCommand ?? defaults.dshCommand,
    dshHome: row.dshHome ?? defaults.dshHome,
    provider: row.provider ?? defaults.provider,
    model: row.model ?? defaults.model,
    webProfile: row.webProfile ?? defaults.webProfile ?? 'web',
    webPort: row.webPort ?? defaults.webPort ?? 0,
    identityFile: row.identityFile,
    sshOptions: row.sshOptions,
  }));
  const seen = new Set(rows.map((row) => row.id));
  const discoveredRows = [];
  for (const entry of allowed) {
    if (seen.has(entry.alias)) continue;
    seen.add(entry.alias);
    discoveredRows.push({
      id: entry.alias,
      ssh: entry.alias,
      label: entry.hostName === undefined ? entry.alias : `${entry.alias} (${entry.user ?? 'user'}@${entry.hostName})`,
      dshCommand: defaults.dshCommand,
      dshHome: defaults.dshHome,
      provider: defaults.provider,
      model: defaults.model,
      webProfile: defaults.webProfile ?? 'web',
      webPort: defaults.webPort ?? 0,
      discovered: true,
    });
  }
  discoveredRows.sort((a, b) => a.id.localeCompare(b.id));
  return [...rows, ...discoveredRows];
}
