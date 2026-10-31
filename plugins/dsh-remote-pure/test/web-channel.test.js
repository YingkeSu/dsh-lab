import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebChannel } from '../lib/web-channel.js';

function fixture({ external = false } = {}) {
  const calls = [];
  const channel = createWebChannel({
    hosts: [{ id: 'mb', ssh: 'macbook' }],
    resolveDsh: async () => '/fake/dsh',
    runRemote: async () => '',
    remoteWeb: {
      start: async () => { calls.push('start'); return { port: 4000, token: 'tok', tmux: true }; },
      stop: async () => { calls.push('stop'); },
    },
    tunnel: async () => ({ localPort: 5500, close: () => { calls.push('tunnel-close'); } }),
  });
  return { channel, calls, external };
}

test('open tunnels the started remote web and close stops both sides', async () => {
  const { channel, calls } = fixture();
  const info = await channel.open('mb', { useTmux: true });
  assert.deepEqual(info, { hostId: 'mb', url: 'http://127.0.0.1:5500/?token=tok', tmux: true, external: false });
  await channel.close('mb');
  assert.deepEqual(calls, ['start', 'tunnel-close', 'stop']);
});

test('attaching an existing instance never starts or stops a remote process', async () => {
  const { channel, calls } = fixture();
  const info = await channel.open('mb', { attachUrl: 'http://127.0.0.1:3088/?token=existing' });
  assert.equal(info.url, 'http://127.0.0.1:5500/?token=existing');
  assert.equal(info.external, true);
  await channel.close('mb');
  assert.deepEqual(calls, ['tunnel-close']);
});
