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
