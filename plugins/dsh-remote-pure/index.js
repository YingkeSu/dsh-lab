/**
 * Host half of the remote panel: one HTTP route over the local web server,
 * backed by SSH-hosted `dsh --profile sdk` runtimes. Host rows come from the
 * profile config plus the user's own `~/.ssh/config`, so an existing SSH alias
 * (and its key/agent setup) can be picked directly. Nothing is persisted locally.
 */
import { createManager } from './lib/manager.js';
import { createApi } from './lib/http-api.js';
import { createDshResolver } from './lib/dsh-command.js';
import { createProfiles, normalizeProfile } from './lib/profiles.js';
import { createRemoteFs } from './lib/remote-fs.js';
import { sshRun } from './lib/ssh.js';
import { mergeHosts, readSshConfig } from './lib/ssh-config.js';
import { registerTerminal, registerTerminalAssets } from './lib/terminal.js';
import { isLocalPort } from './lib/tunnel.js';
import { createUpdater } from './lib/update.js';
import { createWebChannel } from './lib/web-channel.js';

export const name = 'remote-pure';

/** The web server serves the panel; the subprocess service owns terminal PTYs. */
export const inject = ['webServer', 'subprocess'];

/** Read explicit host rows from the profile config. */
function readHosts(config) {
  const rows = Array.isArray(config?.hosts) ? config.hosts : [];
  return rows
    .filter((row) => row && typeof row.id === 'string' && typeof row.ssh === 'string')
    .map((row) => ({
      id: row.id,
      ssh: row.ssh,
      label: typeof row.label === 'string' ? row.label : row.id,
      dshCommand: row.dshCommand,
      dshHome: row.dshHome,
      provider: row.provider,
      model: row.model,
      identityFile: row.identityFile,
      sshOptions: Array.isArray(row.sshOptions) ? row.sshOptions : undefined,
      connectTimeoutMs: row.connectTimeoutMs,
      webProfile: normalizeProfile(row.webProfile),
      webPort: isLocalPort(row.webPort) ? row.webPort : undefined,
    }));
}

export function apply(ctx, config = {}) {
  const defaults = {
    dshCommand: config.defaultDshCommand ?? 'dsh',
    dshHome: config.defaultDshHome ?? '$HOME/.dsh',
    provider: config.defaultProvider ?? 'deepseek-official',
    model: config.defaultModel ?? 'deepseek-flash',
    webProfile: normalizeProfile(config.defaultWebProfile) ?? 'web',
    webPort: isLocalPort(config.defaultWebPort) ? config.defaultWebPort : 0,
  };
  const discovered = config.discoverSshHosts === false ? [] : readSshConfig(config.sshConfigPath);
  const ignore = Array.isArray(config.ignoreSshHosts) ? config.ignoreSshHosts : [];
  const hosts = mergeHosts({ configured: readHosts(config), discovered, defaults, ignore });
  const resolveDsh = createDshResolver({ runRemote: sshRun });
  const manager = createManager({ hosts, dshResolver: resolveDsh });
  const remoteFs = createRemoteFs({ hosts });
  const webChannel = createWebChannel({ hosts, resolveDsh, runRemote: sshRun });
  const profiles = createProfiles({ hosts, runRemote: sshRun });
  const autoUpdate = config.autoUpdate === 'off' || config.autoUpdate === 'auto' ? config.autoUpdate : 'notify';
  const updater = createUpdater({ mode: autoUpdate, getManager: () => ctx.get('pluginManager') });
  const handle = createApi({
    manager,
    fs: remoteFs,
    updater,
    webChannel,
    profiles,
    hosts: hosts.map(({ id, label, discovered: fromConfig, webProfile, webPort }) => ({
      id,
      label,
      discovered: fromConfig === true,
      webProfile: webProfile ?? 'web',
      webPort: webPort ?? 0,
    })),
  });
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/remote-pure/api', handler: handle }),
    'remote-pure: routes',
  );
  ctx.effect(() => () => manager.dispose(), 'remote-pure: connections');
  ctx.effect(() => () => { void webChannel.dispose(); }, 'remote-pure: web channels');
  ctx.effect(() => registerTerminalAssets({ webServer: ctx.webServer }), 'remote-pure: terminal assets');
  ctx.effect(
    () => registerTerminal({ webServer: ctx.webServer, subprocess: ctx.subprocess, hosts }),
    'remote-pure: terminal bridge',
  );
}
