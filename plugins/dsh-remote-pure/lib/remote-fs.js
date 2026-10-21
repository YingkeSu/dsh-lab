/**
 * Remote filesystem reads for project selection: resolve a directory over SSH
 * and list its subdirectories. Mutates nothing; connection state is not used,
 * so browsing works before a project is connected.
 */
import { posix } from 'node:path';
import { shellQuote, sshRun } from './ssh.js';

export function createRemoteFs({ hosts, run = sshRun }) {
  const byId = new Map(hosts.map((host) => [host.id, host]));
  const target = (hostId) => {
    const found = byId.get(hostId);
    if (found === undefined) throw new Error(`unknown remote host: ${hostId}`);
    return found;
  };
  const exec = (hostId, command) => run({ target: target(hostId), command }, { timeout: 20000 });
  // Keep `~` expandable by the remote shell while quoting the rest of the path.
  const pathArg = (path) => {
    const value = String(path);
    if (!value.startsWith('/') && !value.startsWith('~')) {
      throw new Error(`remote path must be absolute or start with ~: ${value}`);
    }
    if (value === '~') return '"$HOME"';
    return value.startsWith('~') ? `"$HOME"${shellQuote(value.slice(1))}` : shellQuote(value);
  };

  async function list(hostId, path) {
    // NUL-delimited records survive newlines in directory names.
    const output = await exec(
      hostId,
      `cd ${pathArg(path)} 2>/dev/null && printf '%s\\0' "$PWD" && find . -mindepth 1 -maxdepth 1 -type d -print0`,
    );
    const [cwd, ...rows] = output.split('\0');
    if (cwd === undefined || cwd === '') throw new Error(`cannot list remote directory: ${path}`);
    const dirs = rows
      .filter((row) => row.startsWith('./'))
      .map((row) => row.slice(2))
      .sort((a, b) => (Number(a.startsWith('.')) - Number(b.startsWith('.'))) || a.localeCompare(b));
    return { path: cwd, parent: posix.dirname(cwd), dirs };
  }

  /** Create a directory (and parents) on the remote host, returning its resolved path. */
  async function mkdir(hostId, path) {
    return (await exec(hostId, `mkdir -p ${pathArg(path)} && cd ${pathArg(path)} && pwd`)).trim();
  }

  return { list, mkdir };
}
