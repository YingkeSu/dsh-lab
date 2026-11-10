/**
 * Start a remote `dsh web` for the tunneled web UI. The DSH web server is bound
 * to 127.0.0.1 and prints a one-time token URL; we capture it on the remote host
 * and never expose the remote port. tmux is optional: it keeps the remote
 * process alive across SSH drops, and we fall back to nohup when tmux is absent.
 * The profile defaults to `web`; `dsh <profile>` is shorthand for
 * `dsh --profile <profile>`.
 *
 * Starting is idempotent per host. The plugin owns the remote server only in
 * local process memory, so a GUI restart or a failed tunnel can leave the tmux
 * session running with no handle. Before creating a session we therefore look
 * for that session: a healthy one (URL in the log, port answering) is reused, a
 * stale one is killed and relaunched, and losing a creation race to another
 * local caller is recovered by adopting the session it created.
 */
import { shellQuote } from './ssh.js';
import { remotePath } from './paths.js';
import { isLaunchableProfile } from './profiles.js';

const URL_PATTERN = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/;
const URL_GREP = 'http://127.0.0.1:[0-9]*/?token=[A-Za-z0-9_-]*';
const REUSE_NOTE = '已复用远端已在运行的 dsh web';
const DUPLICATE = /duplicate session/;

function paths(target) {
  const home = target.dshHome ?? '$HOME/.dsh';
  return { dir: `${home}/remote-pure`, log: `${home}/remote-pure/web.log` };
}

/** Parse the token URL printed by `dsh web`. */
export function parseWebUrl(text) {
  const match = URL_PATTERN.exec(text);
  if (match === null) return null;
  return { port: Number(match[1]), token: match[2], url: match[0] };
}

/**
 * Build the shell script that launches the remote dsh web, tmux or nohup.
 * `profile` is re-validated here so it can never inject into the remote shell.
 */
export function launchScript({ command, log, dir, useTmux, sessionName, profile = 'web' }) {
  if (!isLaunchableProfile(profile)) throw new Error(`invalid dsh profile: ${String(profile)}`);
  const dirExpr = remotePath(dir);
  const logExpr = remotePath(log);
  const args = `${profile} --no-open --port 0`;
  if (useTmux) {
    // tmux passes this string to a shell, so env assignments and `$HOME` expand.
    const run = `${command} ${args} > ${logExpr} 2>&1`;
    return `mkdir -p ${dirExpr} && tmux new-session -d -s ${shellQuote(sessionName)} ${shellQuote(run)}`;
  }
  // `env` accepts an `ENV=value executable ...` command form; the remote shell
  // owns the redirect so the log path expands.
  return `mkdir -p ${dirExpr} && nohup env ${command} ${args} > ${logExpr} 2>&1 </dev/null & echo $!`;
}

/** The exact tmux target, so a session name can never match a longer one. */
function tmuxTarget(sessionName) {
  return `=${shellQuote(sessionName)}`;
}

/** Read the last token URL printed into this server's log. */
async function readWebUrl({ target, runRemote, log }) {
  try {
    return parseWebUrl(String(await runRemote({ target, command: `grep -o ${shellQuote(URL_GREP)} ${remotePath(log)} 2>/dev/null | tail -1` })));
  } catch {
    return null;
  }
}

/** Whether the named tmux session still exists on the remote host. */
async function hasSession({ target, runRemote, sessionName }) {
  try {
    return String(await runRemote({ target, command: `tmux has-session -t ${tmuxTarget(sessionName)} 2>/dev/null && echo yes || echo no` })).trim() === 'yes';
  } catch {
    return false;
  }
}

/** Kill only the named session, never an unrelated tmux window. */
async function killSession({ target, runRemote, sessionName }) {
  await runRemote({ target, command: `tmux kill-session -t ${tmuxTarget(sessionName)} 2>/dev/null || true` }).catch(() => {});
}

/** True when the remote loopback port answers HTTP; 401 counts as a live server. */
async function webAlive({ target, runRemote, port }) {
  const url = `http://127.0.0.1:${Number(port)}/`;
  // A host without curl still has a live tmux pane we cannot probe over HTTP;
  // report that as unknown instead of killing a healthy server on every open.
  const command = `if command -v curl >/dev/null 2>&1; then curl -s -o /dev/null -w '%{http_code}' --max-time 2 ${url} 2>/dev/null || true; else echo unknown; fi`;
  try {
    const code = String(await runRemote({ target, command })).trim();
    if (code === 'unknown') return true;
    return /^[1-9][0-9]{2}$/.test(code);
  } catch {
    return false;
  }
}

/**
 * Inspect this host's previous session: does it still exist, and if so is the
 * server behind it still reachable? `url` is null for a missing or stale one.
 */
async function inspectSession({ target, runRemote, log, sessionName }) {
  if (!(await hasSession({ target, runRemote, sessionName }))) return { exists: false, url: null };
  const parsed = await readWebUrl({ target, runRemote, log });
  if (parsed === null || !(await webAlive({ target, runRemote, port: parsed.port }))) return { exists: true, url: null };
  return { exists: true, url: parsed };
}

async function waitForUrl({ target, runRemote, log, previousUrl = null }) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const parsed = await readWebUrl({ target, runRemote, log });
    // A relaunch truncates the old log, but `tmux new-session` returns before
    // the shell has run the redirect: the previous URL can still be the only
    // line for a moment. It is never this server's URL, so wait past it.
    if (parsed !== null && parsed.url !== previousUrl && await webAlive({ target, runRemote, port: parsed.port })) return parsed;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const tail = await runRemote({ target, command: `tail -20 ${remotePath(log)} 2>/dev/null` }).catch(() => '');
  throw new Error(`remote dsh web did not report a URL in time${tail ? `\n${String(tail).trim().slice(-800)}` : ''}`);
}

/** Wait (bounded) for the session another local caller won the race to host. */
async function waitForSession({ target, runRemote, log, sessionName }) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const state = await inspectSession({ target, runRemote, log, sessionName });
    if (state.url !== null) return state.url;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

/**
 * Start the remote server and return its token URL plus how to stop it.
 * @returns {{port:number, token:string, url:string, tmux:boolean, sessionName?:string, pid?:number, log:string, note?:string}}
 */
export async function startRemoteWeb({ target, command, useTmux, runRemote, profile = 'web' }) {
  if (!isLaunchableProfile(profile)) throw new Error(`invalid dsh profile: ${String(profile)}`);
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
  if (tmux) {
    const existing = await inspectSession({ target, runRemote, log, sessionName });
    if (existing.url !== null) {
      return { ...existing.url, tmux: true, sessionName, log, note: note ?? REUSE_NOTE };
    }
    // A previous local process (or a failed tunnel) can leave a session whose
    // server is gone or wedged; a fresh `new-session` with the same name would
    // be rejected, so replace it instead of colliding.
    if (existing.exists) await killSession({ target, runRemote, sessionName });
  }
  const previousUrl = (await readWebUrl({ target, runRemote, log }))?.url ?? null;
  try {
    const output = await runRemote({ target, command: launchScript({ command, log, dir, useTmux: tmux, sessionName, profile }) });
    const parsed = await waitForUrl({ target, runRemote, log, previousUrl });
    const pid = tmux ? undefined : Number(String(output).trim().split('\n').pop()) || undefined;
    return { ...parsed, tmux, sessionName: tmux ? sessionName : undefined, pid, log, note };
  } catch (error) {
    // Another local caller created the session between our probe and launch;
    // adopting its server gives the same result as creating one ourselves.
    if (tmux && DUPLICATE.test(String(error?.message))) {
      const existing = await waitForSession({ target, runRemote, log, sessionName });
      if (existing !== null) return { ...existing, tmux: true, sessionName, log, note: note ?? REUSE_NOTE };
    }
    throw error;
  }
}

/** Stop a remote web server we started (never an external one). */
export async function stopRemoteWeb({ target, handle, runRemote }) {
  if (handle.tmux) {
    await killSession({ target, runRemote, sessionName: handle.sessionName });
    return;
  }
  if (Number.isSafeInteger(handle.pid) && handle.pid > 1) {
    await runRemote({ target, command: `kill ${handle.pid} 2>/dev/null || true` }).catch(() => {});
  }
}
