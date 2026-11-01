/**
 * Detect the dsh profiles installed on a remote host so the panel can offer the
 * profiles its Web UI can start. One SSH round trip lists every profile
 * directory and returns each package.json as base64; decoding and bundle
 * inspection happen locally, so no node runtime is needed on the remote host.
 */
import { remotePath } from './paths.js';

export const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const PROFILE_LIMIT = 64;
const DESKTOP = 'desktop';
const WEB_BUNDLE = '@deepseek-ai/dsh-web-app';
const SDK_BUNDLE = '@deepseek-ai/dsh-sdk-app';
const DEFAULT_DSH_HOME = '$HOME/.dsh';
/** Emitted when `<dshHome>/profiles` is absent, so an empty result is explainable. */
const NO_PROFILES = '__DSH_REMOTE_PURE_NO_PROFILES__';

/** A syntactically valid dsh profile name. */
export function isValidProfileName(name) {
  return typeof name === 'string' && name.length <= PROFILE_LIMIT && PROFILE_NAME.test(name);
}

/** A profile the CLI can start: valid name and not the GUI-only `desktop` profile. */
export function isLaunchableProfile(name) {
  return isValidProfileName(name) && name.toLowerCase() !== DESKTOP;
}

/** Keep a usable profile name, otherwise undefined so callers apply defaults. */
export function normalizeProfile(value) {
  return isLaunchableProfile(value) ? value : undefined;
}

/** One POSIX sh command that emits `name<TAB>base64(package.json)` per profile. */
export function profileListScript(target) {
  const dir = remotePath(`${target.dshHome ?? DEFAULT_DSH_HOME}/profiles`);
  return [
    `dir=${dir};`,
    `if [ ! -d "$dir" ]; then echo ${NO_PROFILES}; exit 0; fi;`,
    'for f in "$dir"/*/package.json; do',
    '  if [ ! -f "$f" ]; then continue; fi;',
    '  name=${f%/package.json};',
    '  name=${name##*/};',
    "  printf '%s\\t' \"$name\";",
    "  base64 < \"$f\" | tr -d '\\n';",
    "  printf '\\n';",
    'done',
  ].join(' ');
}

/** Bundle ids declared by a profile manifest (`dsh.profile.bundles`). */
function bundleList(manifest) {
  if (Array.isArray(manifest?.dsh?.profile?.bundles)) return manifest.dsh.profile.bundles;
  // Older/simplified manifests may carry the list at the top level.
  if (Array.isArray(manifest?.bundles)) return manifest.bundles;
  return [];
}

function parseManifest(encoded) {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Parse the remote listing into profile rows. Invalid names and the GUI-only
 * `desktop` profile are dropped; a manifest that does not parse still keeps its
 * row with `web`/`sdk` false.
 * @returns {{profiles: {name:string, web:boolean, sdk:boolean}[], missing:boolean}}
 */
export function parseProfileListing(text) {
  const profiles = [];
  let missing = false;
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line === '') continue;
    if (line === NO_PROFILES) {
      missing = true;
      continue;
    }
    const tab = line.indexOf('\t');
    const name = tab === -1 ? line : line.slice(0, tab);
    if (name === 'node_modules' || !isLaunchableProfile(name)) continue;
    const bundles = tab === -1 ? [] : bundleList(parseManifest(line.slice(tab + 1)));
    profiles.push({ name, web: bundles.includes(WEB_BUNDLE), sdk: bundles.includes(SDK_BUNDLE) });
  }
  profiles.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { profiles, missing };
}

/**
 * Build the profile lister for the panel. SSH failures and a missing profile
 * directory are reported as an empty list plus a Chinese warning, never as a
 * hard error, because the panel can fall back to starting the default profile.
 */
export function createProfiles({ hosts, runRemote }) {
  const byId = new Map(hosts.map((host) => [host.id, host]));
  const target = (hostId) => {
    const found = byId.get(hostId);
    if (found === undefined) throw new Error(`unknown remote host: ${hostId}`);
    return found;
  };

  async function list(hostId) {
    const host = target(hostId);
    const defaultProfile = normalizeProfile(host.webProfile) ?? 'web';
    let output;
    try {
      output = await runRemote(
        { target: host, ssh: host.ssh, command: profileListScript(host) },
        { timeout: 20000 },
      );
    } catch (error) {
      return {
        hostId,
        profiles: [],
        defaultProfile,
        warning: `无法读取远端 dsh profile（${hostId}）：${error.message}`,
      };
    }
    const { profiles, missing } = parseProfileListing(output);
    if (missing) {
      return {
        hostId,
        profiles: [],
        defaultProfile,
        warning: `远端没有 dsh profile 目录（${host.dshHome ?? DEFAULT_DSH_HOME}/profiles），请先在远端启动一次 dsh`,
      };
    }
    return { hostId, profiles, defaultProfile };
  }

  return { list };
}
