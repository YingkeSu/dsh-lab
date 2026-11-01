/**
 * Local port forward to the remote DSH web server. The panel can pin the local
 * port; a busy or unusable one falls back to a free port with a Chinese note.
 * The tunnel is supervised: when SSH drops, it is re-established on the same
 * local port so an open browser tab keeps working after a short outage.
 */
import { createServer, createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { sshArgs } from './ssh.js';

/** Local ports currently held by live tunnels in this process. */
const usedPorts = new Set();

/** A requested local port: an integer 0..65535, where 0 means automatic. */
export function isLocalPort(value) {
  return Number.isInteger(value) && value >= 0 && value <= 65535;
}

/** Ask the OS for a free loopback port, skipping ports other tunnels hold. */
export async function findFreePort(excluded = usedPorts, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const port = await new Promise((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const { port: found } = server.address();
        server.close(() => resolve(found));
      });
    });
    if (!excluded.has(port)) return port;
  }
  throw new Error('no free local port available');
}

/** True when 127.0.0.1:<port> can be bound locally. */
function canListen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function portReady(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(600, () => done(false));
  });
}

async function waitForPort(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portReady(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

/** The ssh argument vector for one forwarded local port. */
export function tunnelArgs({ target, localPort, remotePort }) {
  return [
    '-N',
    '-o', 'ExitOnForwardFailure=yes',
    ...sshArgs(target, ['-L', `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`]),
  ];
}

/** Production spawner: ssh with all stdio discarded (the tunnel is silent). */
function spawnTunnelProcess(args) {
  return spawn('ssh', args, { stdio: ['ignore', 'ignore', 'ignore'] });
}

/** Pick and reserve the local port before the first ssh attempt. */
async function allocatePort({ requested, probe, pickFreePort }) {
  const notes = [];
  if (requested !== undefined) {
    if (!usedPorts.has(requested) && (await probe(requested))) {
      usedPorts.add(requested);
      return { localPort: requested, notes };
    }
    notes.push(`端口 ${requested} 已被占用，已改用 `);
  }
  const localPort = await pickFreePort(usedPorts);
  if (usedPorts.has(localPort)) {
    throw new Error(`local port ${localPort} is already in use by another tunnel`);
  }
  usedPorts.add(localPort);
  if (notes.length > 0) notes[notes.length - 1] += localPort;
  return { localPort, notes };
}

/**
 * Open `ssh -N -L 127.0.0.1:<local>:127.0.0.1:<remotePort>` and keep it alive.
 * A requested local port that cannot be used (busy, or the ssh forward fails to
 * come up) is replaced by a free port and reported through `note`.
 * @param {object} options
 * @param {number} [options.localPort] requested local port; 0/undefined = automatic
 * @param {number} [options.retries] reconnect attempts after an unexpected drop
 * @param {(port:number)=>Promise<boolean>} [options.probePort] local availability probe
 * @param {(excluded:Set<number>)=>Promise<number>} [options.findFreePort] free-port picker
 * @param {(port:number)=>Promise<boolean>} [options.waitForPort] readiness probe
 * @param {(args:string[])=>import('node:child_process').ChildProcess} [options.spawn] ssh spawner
 * @returns {Promise<{localPort:number, requestedLocalPort?:number, note?:string, close:()=>void}>}
 */
export async function createTunnel({
  target,
  remotePort,
  localPort = 0,
  retries = 5,
  probePort,
  findFreePort: findPort,
  waitForPort: waitReady,
  spawn: spawnTunnel,
} = {}) {
  const probe = probePort ?? canListen;
  const pickFreePort = findPort ?? findFreePort;
  const wait = waitReady ?? waitForPort;
  const startSsh = spawnTunnel ?? spawnTunnelProcess;
  const requested = isLocalPort(localPort) && localPort > 0 ? localPort : undefined;

  const allocated = await allocatePort({ requested, probe, pickFreePort });
  let currentPort = allocated.localPort;
  const notes = allocated.notes;
  let child = null;
  let timer = null;
  let attempts = 0;
  let closed = false;

  const start = () => {
    if (closed) return;
    const spawnPort = currentPort;
    child = startSsh(tunnelArgs({ target, localPort: spawnPort, remotePort }));
    child.on?.('error', () => {});
    child.on?.('exit', () => {
      // A replaced port means this child was retired on purpose: ignore its exit.
      if (closed || spawnPort !== currentPort || attempts >= retries) return;
      attempts += 1;
      timer = setTimeout(start, 500 * attempts);
    });
  };

  const stop = () => {
    closed = true;
    clearTimeout(timer);
    child?.kill?.('SIGTERM');
  };

  start();
  if (!(await wait(currentPort))) {
    // Retire this child by clearing currentPort first, so its exit handler does
    // not schedule a restart while we fall back to another port.
    const failedPort = currentPort;
    currentPort = 0;
    child?.kill?.('SIGTERM');
    usedPorts.delete(failedPort);
    if (requested === undefined || failedPort !== requested) {
      stop();
      throw new Error(`ssh tunnel did not become ready on 127.0.0.1:${failedPort}`);
    }
    // The requested port passed the local probe but the ssh forward never came
    // up: retry once on another free port instead of failing the whole channel.
    const excluded = new Set(usedPorts);
    excluded.add(failedPort);
    const fallbackPort = await pickFreePort(excluded);
    usedPorts.add(fallbackPort);
    currentPort = fallbackPort;
    notes.push(`端口 ${requested} 未能建立 SSH 隧道，已改用 ${fallbackPort}`);
    start();
    if (!(await wait(currentPort))) {
      const deadPort = currentPort;
      currentPort = 0;
      usedPorts.delete(deadPort);
      stop();
      throw new Error(`ssh tunnel did not become ready on 127.0.0.1:${deadPort}`);
    }
  }

  const note = notes.join('；');
  return {
    localPort: currentPort,
    ...(requested === undefined ? {} : { requestedLocalPort: requested }),
    ...(note === '' ? {} : { note }),
    close() {
      stop();
      usedPorts.delete(currentPort);
    },
  };
}
