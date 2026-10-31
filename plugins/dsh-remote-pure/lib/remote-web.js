/**
 * Start a remote `dsh web` for the tunneled web UI. The DSH web server is bound
 * to 127.0.0.1 and prints a one-time token URL; we capture it on the remote host
 * and never expose the remote port. tmux is optional: it keeps the remote
 * process alive across SSH drops, and we fall back to nohup when tmux is absent.
 */
import { shellQuote } from './ssh.js';

const URL_PATTERN = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/;

function paths(target) {
  const home = target.dshHome ?? '$HOME/.dsh';
  return { dir: `${home}/remote-pure`, log: `${home}/remote-pure/web.log` };
}

/** Quote a remote path, letting a configured `$HOME` prefix expand. */
function remotePath(value) {
  const text = String(value);
  if (text === '$HOME') return '"$HOME"';
  if (text.startsWith('$HOME/')) return `"$HOME"${shellQuote(text.slice(5))}`;
  return shellQuote(text);
}

/** Parse the token URL printed by `dsh web`. */
export function parseWebUrl(text) {
  const match = URL_PATTERN.exec(text);
  if (match === null) return null;
  return { port: Number(match[1]), token: match[2], url: match[0] };
}

/** Build the shell script that launches the remote dsh web, tmux or nohup. */
export function launchScript({ command, log, dir, useTmux, sessionName }) {
  const dirExpr = remotePath(dir);
  const logExpr = remotePath(log);
  const args = `web --no-open --port 0`;
  if (useTmux) {
    // tmux passes this string to a shell, so env assignments and `$HOME` expand.
    const run = `${command} ${args} > ${logExpr} 2>&1`;
    return `mkdir -p ${dirExpr} && tmux new-session -d -s ${shellQuote(sessionName)} ${shellQuote(run)}`;
  }
  // `env` accepts an `ENV=value executable ...` command form; the remote shell
  // owns the redirect so the log path expands.
  return `mkdir -p ${dirExpr} && nohup env ${command} ${args} > ${logExpr} 2>&1 </dev/null & echo $!`;
}

async function waitForUrl({ target, runRemote, log }) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const output = await runRemote({ target, command: `grep -o ${shellQuote("http://127.0.0.1:[0-9]*/?token=[A-Za-z0-9_-]*")} ${remotePath(log)} 2>/dev/null | tail -1` });
    const parsed = parseWebUrl(output);
    if (parsed !== null) return parsed;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const tail = await runRemote({ target, command: `tail -20 ${remotePath(log)} 2>/dev/null` }).catch(() => '');
  throw new Error(`remote dsh web did not report a URL in time${tail ? `\n${String(tail).trim().slice(-800)}` : ''}`);
}

/**
 * Start the remote server and return its token URL plus how to stop it.
 * @returns {{port:number, token:string, url:string, tmux:boolean, sessionName?:string, pid?:number, log:string, note?:string}}
 */
export async function startRemoteWeb({ target, command, useTmux, runRemote }) {
  const { dir, log } = paths(target);
  const sessionName = `dsh-remote-pure-${target.id.replace(/[^A-Za-z0-9_-]/g, '-')}`.slice(0, 60);
  let tmux = useTmux === true;
  let note;
  if (tmux) {
    const probe = await runRemote({ target, command: 'command -v tmux >/dev/null 2>&1 && echo yes || echo no' }).catch(() => 'no');
    if (!probe.includes('yes')) {
      tmux = false;
      note = '远端没有 tmux，已用 nohup 启动（SSH 断开后通常仍存活，但无法 reattach）';
    }
  }
  const output = await runRemote({ target, command: launchScript({ command, log, dir, useTmux: tmux, sessionName }) });
  const parsed = await waitForUrl({ target, runRemote, log });
  const pid = tmux ? undefined : Number(String(output).trim().split('\n').pop()) || undefined;
  return { ...parsed, tmux, sessionName: tmux ? sessionName : undefined, pid, log, note };
}

/** Stop a remote web server we started (never an external one). */
export async function stopRemoteWeb({ target, handle, runRemote }) {
  if (handle.tmux) {
    await runRemote({ target, command: `tmux kill-session -t ${shellQuote(handle.sessionName)} 2>/dev/null || true` }).catch(() => {});
    return;
  }
  if (Number.isSafeInteger(handle.pid) && handle.pid > 1) {
    await runRemote({ target, command: `kill ${handle.pid} 2>/dev/null || true` }).catch(() => {});
  }
}
