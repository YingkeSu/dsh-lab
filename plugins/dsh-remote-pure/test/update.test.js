import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, createUpdater } from '../lib/update.js';

test('compareVersions orders release versions', () => {
  assert.equal(compareVersions('0.11.1', '0.11.2'), -1);
  assert.equal(compareVersions('0.12.0', '0.11.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('v0.9.0', '0.10.0'), -1);
});

test('notify mode reports an available update from the plugin manager', async () => {
  const updater = createUpdater({
    mode: 'notify',
    currentVersion: '0.11.1',
    getManager: () => ({ inspect: async () => ({ status: 'accepted', version: '0.12.0' }) }),
  });
  const state = await updater.check();
  assert.equal(state.latest, '0.12.0');
  assert.equal(state.updateAvailable, true);
  assert.match(state.command, /dsh plugin --profile .* add dsh-remote-pure@latest/);
});

test('off mode never asks the registry and auto mode falls back to a manual command', async () => {
  let asked = 0;
  const off = createUpdater({ mode: 'off', getManager: () => ({ inspect: async () => { asked += 1; return {}; } }) });
  assert.equal((await off.check()).updateAvailable, false);
  assert.equal(asked, 0);

  const auto = createUpdater({
    mode: 'auto',
    currentVersion: '0.11.1',
    getManager: () => ({ inspect: async () => ({ status: 'accepted', version: '0.12.0' }) }),
  });
  const result = await auto.apply();
  assert.equal(result.application, 'manual');
});

/** A Host PluginManager double that records the order of its update calls. */
function managerFixture({ latest = '0.16.0', remove = { application: 'applied' }, install = { application: 'applied' } } = {}) {
  const calls = [];
  return {
    calls,
    inspect: async () => ({ status: 'accepted', version: latest }),
    removeBundle: async (name) => {
      calls.push(['remove', name]);
      if (remove instanceof Error) throw remove;
      return remove;
    },
    installBundle: async (spec) => {
      calls.push(['install', spec]);
      if (install instanceof Error) throw install;
      return install;
    },
  };
}

test('the update button uninstalls the installed copy before installing the latest', async () => {
  const manager = managerFixture();
  const updater = createUpdater({ mode: 'notify', currentVersion: '0.15.0', getManager: () => manager });
  const result = await updater.apply();
  assert.deepEqual(manager.calls, [['remove', 'dsh-remote-pure'], ['install', 'dsh-remote-pure@0.16.0']]);
  assert.equal(result.application, 'applied');
  assert.equal(result.removal, 'applied');
});

test('a profile without HMR reports the pending restart instead of a silent failure', async () => {
  const manager = managerFixture({ remove: { application: 'restart-required', restartReason: 'no-hmr' }, install: { application: 'restart-required', restartReason: 'no-hmr' } });
  const updater = createUpdater({ mode: 'auto', currentVersion: '0.15.0', getManager: () => manager });
  const result = await updater.apply();
  assert.equal(result.application, 'restart-required');
  assert.equal(result.restartReason, 'no-hmr');
  assert.deepEqual(manager.calls.map((call) => call[0]), ['remove', 'install']);
});

test('a refused install falls back to the manual command with the manager diagnostic', async () => {
  const manager = managerFixture({ install: { application: 'failed', error: { code: 'already-installed' } } });
  const updater = createUpdater({ mode: 'notify', currentVersion: '0.15.0', getManager: () => manager });
  const result = await updater.apply();
  assert.equal(result.application, 'manual');
  assert.equal(result.error.code, 'already-installed');
  assert.match(result.command, /add dsh-remote-pure@latest/);
});

test('a thrown install keeps its diagnostic and offers the manual command', async () => {
  const manager = managerFixture({ install: new Error('registry unreachable') });
  const updater = createUpdater({ currentVersion: '0.15.0', getManager: () => manager });
  const result = await updater.apply();
  assert.equal(result.application, 'manual');
  assert.equal(result.error.diagnostic, 'registry unreachable');
});

test('an up-to-date plugin skips and a host without a manager offers the command', async () => {
  const current = createUpdater({ currentVersion: '0.16.0', getManager: () => managerFixture() });
  assert.equal((await current.apply()).application, 'skipped');
  const noManager = createUpdater({ currentVersion: '0.15.0', getManager: () => undefined, fetchLatest: async () => '0.16.0' });
  const result = await noManager.apply();
  assert.equal(result.application, 'manual');
  assert.match(result.command, /add dsh-remote-pure@latest/);
});

test('a failed removal still tries the install and reports its outcome', async () => {
  const manager = managerFixture({ remove: new Error('pnpm remove failed'), install: { application: 'restart-required', restartReason: 'no-hmr' } });
  const updater = createUpdater({ currentVersion: '0.15.0', getManager: () => manager });
  const result = await updater.apply();
  assert.equal(result.application, 'restart-required');
  assert.equal(result.removal, 'failed');
  assert.deepEqual(manager.calls.map((call) => call[0]), ['remove', 'install']);
});
