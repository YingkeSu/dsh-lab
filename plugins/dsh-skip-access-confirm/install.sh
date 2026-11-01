#!/usr/bin/env bash
# Install (or remove) dsh-skip-access-confirm in a dsh profile.
#
#   ./install.sh [profile] [dsh-home]              install
#   ./install.sh --uninstall [profile] [dsh-home]  remove
#
# Defaults: profile=desktop (the DSH Desktop app), dsh-home=$DSH_HOME or ~/.dsh.
#
# The plugin is installed the same way every other dsh plugin is: a profile
# dependency, a bundle selection, and a node_modules entry. The bundle's own
# cordis.patch.yml adds the Loader row, so the profile's user patch stays
# untouched. Every step is idempotent; package.json is backed up once.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
mode="install"
if [ "${1:-}" = "--uninstall" ]; then
  mode="uninstall"
  shift
fi
profile="${1:-desktop}"
dsh_home="${2:-${DSH_HOME:-$HOME/.dsh}}"
profile_dir="$dsh_home/profiles/$profile"
manifest="$profile_dir/package.json"

if [ ! -f "$manifest" ]; then
  echo "profile not found: $profile_dir" >&2
  echo "available profiles:" >&2
  ls "$dsh_home/profiles" >&2
  exit 1
fi

if [ "$mode" = "uninstall" ]; then
  python3 - "$manifest" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as handle:
    manifest = json.load(handle)
manifest.get('dependencies', {}).pop('dsh-skip-access-confirm', None)
bundles = manifest.get('dsh', {}).get('profile', {}).get('bundles')
if isinstance(bundles, list):
    manifest['dsh']['profile']['bundles'] = [
        name for name in bundles if name != 'dsh-skip-access-confirm'
    ]
with open(path, 'w') as handle:
    json.dump(manifest, handle, indent=2, ensure_ascii=False)
    handle.write('\n')
PY
  rm -f "$profile_dir/node_modules/dsh-skip-access-confirm"
  echo "removed dsh-skip-access-confirm from $profile_dir"
  echo "restart dsh to unload it."
  exit 0
fi

cp "$manifest" "$manifest.bak-skip-access-confirm-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$profile_dir/node_modules"
ln -sfn "$here" "$profile_dir/node_modules/dsh-skip-access-confirm"

python3 - "$manifest" "$here" <<'PY'
import json, sys
path, source = sys.argv[1], sys.argv[2]
with open(path) as handle:
    manifest = json.load(handle)
dependencies = manifest.setdefault('dependencies', {})
dependencies['dsh-skip-access-confirm'] = 'link:' + source
profile = manifest.setdefault('dsh', {}).setdefault('profile', {})
bundles = profile.setdefault('bundles', [])
if 'dsh-skip-access-confirm' not in bundles:
    bundles.append('dsh-skip-access-confirm')
with open(path, 'w') as handle:
    json.dump(manifest, handle, indent=2, ensure_ascii=False)
    handle.write('\n')
PY

echo "installed into $profile_dir"
echo "restart dsh (the Desktop app: quit and reopen) to load it;"
echo "profile patch changes are not hot-reloaded on the Desktop host."
