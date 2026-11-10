/**
 * One tunneled remote DSH web UI per host. The remote server is started on the
 * far side (optionally inside tmux so it survives SSH drops) and reached through
 * a supervised local SSH tunnel; an already-running instance can be attached by
 * passing its token URL instead. The profile defaults to the host's
 * `webProfile`, and its local port to the host's `webPort` (0 = automatic).
 */
import { createTunnel } from './tunnel.js';
import { parseWebUrl, startRemoteWeb, stopRemoteWeb } from './remote-web.js';

export function createWebChannel({
  hosts,
  resolveDsh,
  runRemote,
  tunnel = createTunnel,
  remoteWeb = { start: startRemoteWeb, stop: stopRemoteWeb },
}) {
  const byId = new Map(hosts.map((host) => [host.id, host]));
  const channels = new Map();
  // An open is several awaits long (dsh detection, remote start, tunnel); a
  // second click or the panel's own remount must join that attempt instead of
  // starting a second remote server.
  const pending = new Map();

  const target = (hostId) => {
    const found = byId.get(hostId);
    if (found === undefined) throw new Error(`unknown remote host: ${hostId}`);
    return found;
  };

  async function open(hostId, options = {}) {
    const existing = channels.get(hostId);
    if (existing !== undefined) return existing.info;
    const inflight = pending.get(hostId);
    if (inflight !== undefined) return inflight;
    const attempt = openChannel(hostId, options).finally(() => pending.delete(hostId));
    pending.set(hostId, attempt);
    return attempt;
  }

  async function openChannel(hostId, options) {
    const host = target(hostId);
    const external = typeof options.attachUrl === 'string' && options.attachUrl.trim() !== '';
    const localPort = options.localPort ?? host.webPort ?? 0;
    let profile = null;
    let remote;
    if (external) {
      remote = parseWebUrl(options.attachUrl);
      if (remote === null) throw new Error('attachUrl must look like http://127.0.0.1:<port>/?token=<token>');
    } else {
      profile = options.profile ?? host.webProfile ?? 'web';
      const command = await resolveDsh(host);
      remote = await remoteWeb.start({ target: host, command, useTmux: options.useTmux === true, runRemote, profile });
    }
    const handle = await tunnel({ target: host, remotePort: remote.port, localPort });
    const note = [remote.note, handle.note].filter((value) => typeof value === 'string' && value !== '').join('；');
    const info = {
      hostId,
      url: `http://127.0.0.1:${handle.localPort}/?token=${remote.token}`,
      profile,
      localPort: handle.localPort,
      remotePort: remote.port,
      tmux: remote.tmux === true,
      external,
      ...(note === '' ? {} : { note }),
    };
    channels.set(hostId, { host, remote, tunnel: handle, info, external });
    return info;
  }

  async function close(hostId) {
    const channel = channels.get(hostId);
    if (channel === undefined) return { closed: false };
    channels.delete(hostId);
    channel.tunnel.close();
    if (!channel.external) await remoteWeb.stop({ target: channel.host, handle: channel.remote, runRemote });
    return { closed: true };
  }

  async function dispose() {
    for (const hostId of [...channels.keys()]) await close(hostId).catch(() => {});
  }

  return { open, close, dispose };
}
