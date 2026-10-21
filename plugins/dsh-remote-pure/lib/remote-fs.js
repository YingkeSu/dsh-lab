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
  const pathArg = (path) => (String(path).startsWith('~')
    ? `~${shellQuote(String(path).slice(1))}`
    : shellQuote(path));

  async function list(hostId, path) {
    const output = await exec(hostId, `cd ${pathArg(path)} 2>/dev/null && pwd && ls -1Ap`);
    const [cwd, ...rows] = output.split('\n').filter((row) => row !== '');
    if (cwd === undefined) throw new Error(`cannot list remote directory: ${path}`);
    const dirs = rows
      .filter((row) => row.endsWith('/'))
      .map((row) => row.slice(0, -1))
      .sort((a, b) => (Number(a.startsWith('.')) - Number(b.startsWith('.'))) || a.localeCompare(b));
    return { path: cwd, parent: posix.dirname(cwd), dirs };
  }

  /** Create a directory (and parents) on the remote host, returning its resolved path. */
  async function mkdir(hostId, path) {
    return (await exec(hostId, `mkdir -p ${pathArg(path)} && cd ${pathArg(path)} && pwd`)).trim();
  }

  return { list, mkdir };
}
