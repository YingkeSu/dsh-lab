import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteFs } from '../lib/remote-fs.js';

const hosts = [{ id: 'mb', ssh: 'macbook' }];

test('list resolves the directory and returns only subdirectories', async () => {
  const calls = [];
  const fs = createRemoteFs({
    hosts,
    run: async ({ target, command }) => {
      calls.push(command);
      assert.equal(target.ssh, 'macbook');
      return '/home/me/app\nsrc/\nnode_modules/\nREADME.md\n.hidden/\n';
    },
  });
  const result = await fs.list('mb', '~/app');
  assert.equal(result.path, '/home/me/app');
  assert.equal(result.parent, '/home/me');
  assert.deepEqual(result.dirs, ['node_modules', 'src', '.hidden']);
  assert.match(calls[0], /^cd ~'\/app'/);
});
