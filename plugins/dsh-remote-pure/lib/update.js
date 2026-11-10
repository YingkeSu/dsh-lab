/**
 * Optional self-update check and update. The panel never updates silently: a
 * newer npm version shows an update button, and its click removes the installed
 * copy before installing the latest release through the Host's own
 * PluginManager (the order the Plugins page uses). The manager can still answer
 * "restart required" or refuse, in which case the manual command is offered.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const CACHE_MS = 60 * 60 * 1000;

export function compareVersions(left, right) {
  const parse = (value) => String(value).replace(/^v/, '').split('-')[0].split('.').map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

async function fetchLatestFromRegistry() {
  const response = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`npm registry answered ${response.status}`);
  return (await response.json()).version;
}

export function createUpdater({
  mode = 'notify',
  profile = process.env.DSH_PROFILE ?? 'web',
  getManager = () => undefined,
  fetchLatest = fetchLatestFromRegistry,
  currentVersion = pkg.version,
} = {}) {
  let cache;
  const command = `dsh plugin --profile ${profile} add ${pkg.name}@latest`;

  async function latestVersion() {
    if (cache !== undefined && Date.now() - cache.at < CACHE_MS) return cache.version;
    let version;
    const manager = getManager();
    if (manager !== undefined && typeof manager.inspect === 'function') {
      try {
        const inspection = await manager.inspect(`${pkg.name}@latest`);
        if (inspection?.status === 'accepted' && typeof inspection.version === 'string') version = inspection.version;
      } catch {
        // fall through to the direct registry read
      }
    }
    if (version === undefined) {
      try {
        version = await fetchLatest();
      } catch {
        version = null;
      }
    }
    cache = { at: Date.now(), version };
    return version;
  }

  async function check() {
    if (mode === 'off') return { mode, current: currentVersion, latest: null, updateAvailable: false, profile };
    let latest = null;
    try {
      latest = await latestVersion();
    } catch {
      latest = null;
    }
    return { mode, current: currentVersion, latest, updateAvailable: Boolean(latest) && compareVersions(currentVersion, latest) < 0, profile, command };
  }

  async function apply() {
    const state = await check();
    if (state.mode === 'off' || !state.updateAvailable) return { ...state, application: 'skipped' };
    const manager = getManager();
    if (manager === undefined || typeof manager.installBundle !== 'function') return { ...state, application: 'manual', command };
    // The Plugins page removes an installed bundle before installing another
    // version. With HMR that removal is also what lets the install proceed:
    // `installBundle` refuses an already-installed package while HMR is on.
    let removal = null;
    if (typeof manager.removeBundle === 'function') {
      try {
        removal = await manager.removeBundle(pkg.name);
      } catch (error) {
        removal = { application: 'failed', error: { code: 'operation-error', diagnostic: error instanceof Error ? error.message : String(error) } };
      }
    }
    try {
      const result = await manager.installBundle(`${pkg.name}@${state.latest}`);
      const application = result?.application ?? 'unknown';
      if (application === 'applied' || application === 'restart-required') {
        return {
          ...state,
          application,
          removal: removal?.application ?? 'skipped',
          restartReason: result?.restartReason ?? removal?.restartReason,
        };
      }
      return { ...state, application: 'manual', removal: removal?.application ?? 'skipped', command, error: result?.error ?? removal?.error };
    } catch (error) {
      return {
        ...state,
        application: 'manual',
        removal: removal?.application ?? 'skipped',
        command,
        error: { code: 'operation-error', diagnostic: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  return { check, apply };
}
