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
      return '/home/me/app\0./src\0./node_modules\0./.hidden\0';
    },
  });
  const result = await fs.list('mb', '~/app');
  assert.equal(result.path, '/home/me/app');
  assert.equal(result.parent, '/home/me');
  assert.deepEqual(result.dirs, ['node_modules', 'src', '.hidden']);
  assert.match(calls[0], /^cd "\$HOME"'\/app'/);
});


test('mkdir creates the directory over ssh and reports the resolved path', async () => {
  const commands = [];
  const fs = createRemoteFs({
    hosts,
    run: async ({ command }) => {
      commands.push(command);
      return '/home/me/new-project\n';
    },
  });
  assert.equal(await fs.mkdir('mb', '~/new-project'), '/home/me/new-project');
  assert.match(commands[0], /^mkdir -p "\$HOME"'\/new-project' && cd "\$HOME"'\/new-project' && pwd$/);
});


test('relative paths are rejected before touching the remote host', async () => {
  const fs = createRemoteFs({ hosts, run: async () => { throw new Error('should not run'); } });
  await assert.rejects(fs.list('mb', 'labs/app'), /absolute or start with ~/);
});
