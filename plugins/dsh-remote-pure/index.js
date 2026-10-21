/**
 * Host half of the remote panel: one HTTP route over the local web server,
 * backed by SSH-hosted `dsh --profile sdk` runtimes. Host rows come from the
 * profile config plus the user's own `~/.ssh/config`, so an existing SSH alias
 * (and its key/agent setup) can be picked directly. Nothing is persisted locally.
 */
import { createManager } from './lib/manager.js';
import { createApi } from './lib/http-api.js';
import { createRemoteFs } from './lib/remote-fs.js';
import { mergeHosts, readSshConfig } from './lib/ssh-config.js';
import { registerTerminal, registerTerminalAssets } from './lib/terminal.js';
import { createUpdater } from './lib/update.js';

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
    }));
}

export function apply(ctx, config = {}) {
  const defaults = {
    dshCommand: config.defaultDshCommand ?? 'dsh',
    dshHome: config.defaultDshHome ?? '$HOME/.dsh',
    provider: config.defaultProvider ?? 'deepseek-official',
    model: config.defaultModel ?? 'deepseek-flash',
  };
  const discovered = config.discoverSshHosts === false ? [] : readSshConfig(config.sshConfigPath);
  const ignore = Array.isArray(config.ignoreSshHosts) ? config.ignoreSshHosts : [];
  const hosts = mergeHosts({ configured: readHosts(config), discovered, defaults, ignore });
  const manager = createManager({ hosts });
  const remoteFs = createRemoteFs({ hosts });
  const autoUpdate = config.autoUpdate === 'off' || config.autoUpdate === 'auto' ? config.autoUpdate : 'notify';
  const updater = createUpdater({ mode: autoUpdate, getManager: () => ctx.get('pluginManager') });
  const handle = createApi({
    manager,
    fs: remoteFs,
    updater,
    hosts: hosts.map(({ id, label, discovered: fromConfig }) => ({ id, label, discovered: fromConfig === true })),
  });
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/remote-pure/api', handler: handle }),
    'remote-pure: routes',
  );
  ctx.effect(() => () => manager.dispose(), 'remote-pure: connections');
  ctx.effect(() => registerTerminalAssets({ webServer: ctx.webServer }), 'remote-pure: terminal assets');
  ctx.effect(
    () => registerTerminal({ webServer: ctx.webServer, subprocess: ctx.subprocess, hosts }),
    'remote-pure: terminal bridge',
  );
}
