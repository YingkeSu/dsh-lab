/**
 * Find a usable remote `dsh` command before starting the SDK runtime. SSH's
 * non-interactive shell usually lacks the user's interactive PATH, so a bare
 * `dsh` frequently fails with "command not found" even though the user can run
 * it in a terminal. Probe the usual install locations, then a developer
 * checkout invoked through an absolute node binary.
 */
const NOT_FOUND = 'NOT_FOUND';

const PROBE = [
  'for c in dsh "$HOME/bin/dsh" /opt/homebrew/bin/dsh /usr/local/bin/dsh "$HOME/.local/bin/dsh"; do',
  '  if command -v "$c" >/dev/null 2>&1; then command -v "$c"; exit 0; fi;',
  'done;',
  'node_bin=$(command -v node 2>/dev/null);',
  'if [ -z "$node_bin" ]; then',
  '  for n in /opt/homebrew/bin/node /usr/local/bin/node; do',
  '    if [ -x "$n" ]; then node_bin="$n"; break; fi;',
  '  done;',
  'fi;',
  'for p in "$HOME"/labs/ds/*/apps/cli/lib/bin.js; do',
  '  if [ -f "$p" ] && [ -n "$node_bin" ]; then echo "$node_bin $p"; exit 0; fi;',
  'done;',
  `echo ${NOT_FOUND}`,
].join(' ');

/** Resolve a remote dsh command, or null when the probe finds none. */
export async function detectDshCommand({ target, runRemote }) {
  const output = await runRemote({ target, ssh: target.ssh, target, command: PROBE }, { timeout: 20000 });
  const found = output.split('\n').map((line) => line.trim()).filter((line) => line !== '').pop();
  if (found === undefined || found === NOT_FOUND) return null;
  // Accept an absolute binary path, or "<node> <bin.js>" with both absolute.
  const parts = found.split(/\s+/);
  if (parts.length === 1 && parts[0].startsWith('/')) return found;
  if (parts.length === 2 && parts[0].startsWith('/') && parts[1].startsWith('/')) return found;
  return null;
}

const DEFAULT_CACHE_MS = 5 * 60 * 1000;

/**
 * Build a per-manager resolver: an explicit `dshCommand` wins, otherwise the
 * remote probe runs once per host and is cached briefly. A missing command
 * produces an actionable error instead of a bare "command not found".
 */
export function createDshResolver({ runRemote, detectDsh, autoDetectDsh = true, cacheMs = DEFAULT_CACHE_MS } = {}) {
  const cache = new Map();
  return async function resolve(target) {
    const configured = target.dshCommand;
    if (configured !== undefined && configured !== '' && configured !== 'dsh') return configured;
    if (!autoDetectDsh) return configured ?? 'dsh';
    const cached = cache.get(target.id);
    if (cached !== undefined && Date.now() - cached.at < cacheMs) return cached.command;
    let found;
    try {
      found = detectDsh !== undefined ? await detectDsh(target) : await detectDshCommand({ target, runRemote });
    } catch (error) {
      throw new Error(`remote dsh probe failed (${target.id}): ${error.message}`);
    }
    if (found !== null) {
      cache.set(target.id, { at: Date.now(), command: found });
      return found;
    }
    if (configured === 'dsh' || configured === undefined) {
      throw new Error(`remote dsh not found on ${target.id}: install dsh on the remote host, or set dshCommand in the profile hosts row (for example /Users/you/bin/dsh)`);
    }
    return configured;
  };
}
