import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDshCommand } from '../lib/dsh-command.js';

const target = { id: 'mb', ssh: 'macbook' };

test('detectDshCommand accepts an absolute dsh path and a node-plus-checkout command', async () => {
  const absolute = await detectDshCommand({ target, runRemote: async () => '/Users/me/bin/dsh\n' });
  assert.equal(absolute, '/Users/me/bin/dsh');
  const checkout = await detectDshCommand({ target, runRemote: async () => '/opt/homebrew/bin/node /Users/me/labs/ds/dsh/apps/cli/lib/bin.js\n' });
  assert.equal(checkout, '/opt/homebrew/bin/node /Users/me/labs/ds/dsh/apps/cli/lib/bin.js');
});

test('detectDshCommand returns null when the probe finds nothing', async () => {
  assert.equal(await detectDshCommand({ target, runRemote: async () => 'NOT_FOUND\n' }), null);
});
