/**
 * Local port forward to the remote DSH web server. The tunnel is supervised:
 * when SSH drops, it is re-established on the same local port so an open
 * browser tab keeps working after a short outage.
 */
import { createServer, createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { sshArgs } from './ssh.js';

export function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
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

/**
 * Open `ssh -N -L 127.0.0.1:<local>:127.0.0.1:<remotePort>` and keep it alive.
 * @returns a handle whose close() stops supervision and the ssh process.
 */
export async function createTunnel({ target, remotePort, retries = 5 }) {
  const localPort = await findFreePort();
  let child = null;
  let timer = null;
  let attempts = 0;
  let closed = false;

  const start = () => {
    if (closed) return;
    child = spawn('ssh', ['-N', ...sshArgs(target, ['-L', `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`])], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.on('error', () => {});
    child.on('exit', () => {
      if (closed || attempts >= retries) return;
      attempts += 1;
      timer = setTimeout(start, 500 * attempts);
    });
  };
  start();

  if (!(await waitForPort(localPort))) {
    closed = true;
    clearTimeout(timer);
    child?.kill?.('SIGTERM');
    throw new Error(`ssh tunnel did not become ready on 127.0.0.1:${localPort}`);
  }
  return {
    localPort,
    close() {
      closed = true;
      clearTimeout(timer);
      child?.kill?.('SIGTERM');
    },
  };
}
