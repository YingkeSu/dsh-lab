/**
 * Interactive remote terminal: a browser WebSocket is bridged to `ssh -tt`
 * running under the Host's own PTY primitive, so xterm.js gets a real terminal
 * (resize, colors, full-screen programs) while authentication stays with the
 * user's local ssh config/keys — no ssh2 and no stored passwords.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { sshArgs } from './ssh.js';

const require = createRequire(import.meta.url);
const TERMINAL_PATH = '/remote-pure/terminal';

/** Resolve a shipped asset from the plugin's own dependencies. */
function resolveAsset(pkg, relative) {
  try {
    return require.resolve(`${pkg}/${relative}`);
  } catch {
    const main = require.resolve(pkg);
    return join(dirname(main), relative.replace(/^lib\//, ''));
  }
}

const ASSETS = [
  ['/remote-pure/assets/xterm.js', () => resolveAsset('@xterm/xterm', 'lib/xterm.js'), 'text/javascript; charset=utf-8'],
  ['/remote-pure/assets/xterm.css', () => join(dirname(resolveAsset('@xterm/xterm', 'lib/xterm.js')), '..', 'css', 'xterm.css'), 'text/css; charset=utf-8'],
  ['/remote-pure/assets/addon-fit.js', () => resolveAsset('@xterm/addon-fit', 'lib/addon-fit.js'), 'text/javascript; charset=utf-8'],
];

/** Serve the xterm runtime the browser half loads lazily. */
export function registerTerminalAssets({ webServer }) {
  const disposes = ASSETS.map(([path, resolve, type]) => webServer.register({
    kind: 'exact',
    path,
    handler: (req, res) => {
      let body;
      try {
        body = readFileSync(resolve());
      } catch (error) {
        res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`terminal assets unavailable: ${error.message}`);
        return;
      }
      res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=3600' });
      res.end(body);
    },
  }));
  return () => { for (const dispose of disposes) dispose(); };
}

/**
 * Register the WebSocket bridge. One PTY-backed `ssh -tt <alias>` per socket;
 * closing either side tears the other down.
 */
export function registerTerminal({ webServer, subprocess, hosts }) {
  const byId = new Map(hosts.map((host) => [host.id, host]));
  const live = new Set();
  const wss = new WebSocketServer({ noServer: true });

  async function run(ws, target, cols, rows) {
    let handle;
    let closed = false;
    ws.on('close', () => { closed = true; });
    ws.on('error', () => { closed = true; });
    try {
      handle = await subprocess.spawnTerminal({
        argv: ['ssh', ...sshArgs(target, ['-tt'])],
        cwd: process.env.HOME ?? process.cwd(),
        rows,
        cols,
        terminalType: 'xterm-256color',
        graceMs: 5000,
      });
    } catch (error) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'error', message: error.message }));
      ws.close();
      return;
    }
    if (closed) {
      void handle.terminate();
      return;
    }
    live.add(handle);
    handle.output.on('data', (chunk) => {
      if (ws.readyState === ws.OPEN) ws.send(chunk.toString('utf8'));
    });
    handle.done.finally(() => {
      live.delete(handle);
      if (ws.readyState === ws.OPEN) ws.close();
    });
    ws.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (message.type === 'input') void handle.write(String(message.data ?? ''));
      else if (message.type === 'resize') void handle.resize(Number(message.cols) || 80, Number(message.rows) || 24);
    });
    ws.on('close', () => { live.delete(handle); void handle.terminate(); });
  }

  const disposeRoute = webServer.registerUpgrade({
    path: TERMINAL_PATH,
    handler: (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const target = byId.get(url.searchParams.get('hostId') ?? '');
      if (target === undefined) {
        socket.destroy();
        return;
      }
      const cols = Number(url.searchParams.get('cols')) || 80;
      const rows = Number(url.searchParams.get('rows')) || 24;
      wss.handleUpgrade(req, socket, head, (ws) => { void run(ws, target, cols, rows); });
    },
  });

  return () => {
    disposeRoute();
    for (const handle of live) void handle.terminate();
    live.clear();
    wss.close();
  };
}
