/**
 * SSH plumbing shared by every remote operation. One place owns the command
 * line (key/agent/config compatibility) and the two execution shapes: a
 * long-lived stdio child for the SDK runtime, and a bounded one-shot command
 * for filesystem reads.
 */
import { spawn as spawnProcess, execFile } from 'node:child_process';

const BASE_ARGS = [
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=15',
  '-o', 'ServerAliveInterval=15',
  '-o', 'ServerAliveCountMax=4',
];

/** Quote one POSIX shell word. */
export const shellQuote = (value) => `'${String(value).replaceAll("'", `'\\''`)}'`;

/** Build the ssh command line for a host; local keys/agent/config stay in charge. */
export function sshArgs(target) {
  const args = [...BASE_ARGS];
  if (target.identityFile) args.push('-i', target.identityFile);
  if (Array.isArray(target.sshOptions)) args.push(...target.sshOptions);
  args.push(target.ssh);
  return args;
}

/** Spawn an interactive stdio child (the SDK runtime). */
export function sshSpawn({ target, command }) {
  const child = spawnProcess('ssh', [...sshArgs(target), command], { stdio: ['pipe', 'pipe', 'pipe'] });
  return { child };
}

/** Run one remote command to completion and resolve its stdout. */
export function sshRun({ target, command }, { timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('ssh', [...sshArgs(target), command], { maxBuffer: 64 * 1024 * 1024, timeout }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${error.message}${stderr ? `\n${String(stderr).trim()}` : ''}`));
      else resolve(stdout);
    });
  });
}
