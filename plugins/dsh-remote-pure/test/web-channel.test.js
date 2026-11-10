import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebChannel } from '../lib/web-channel.js';

function fixture({ hosts = [{ id: 'mb', ssh: 'macbook' }], remote = {}, tunneled = {} } = {}) {
  const calls = [];
  const channel = createWebChannel({
    hosts,
    resolveDsh: async () => '/fake/dsh',
    runRemote: async () => '',
    remoteWeb: {
      start: async (options) => { calls.push(['start', options]); return { port: 4000, token: 'tok', tmux: true, ...remote }; },
      stop: async (options) => { calls.push(['stop', options]); },
    },
    tunnel: async (options) => {
      calls.push(['tunnel', options]);
      return { localPort: 5500, close: () => { calls.push('tunnel-close'); }, ...tunneled };
    },
  });
  return { channel, calls };
}

test('open tunnels the started remote web and close stops both sides', async () => {
  const { channel, calls } = fixture();
  const info = await channel.open('mb', { useTmux: true });
  assert.deepEqual(info, {
    hostId: 'mb',
    url: 'http://127.0.0.1:5500/?token=tok',
    profile: 'web',
    localPort: 5500,
    remotePort: 4000,
    tmux: true,
    external: false,
  });
  assert.equal(calls[0][0], 'start');
  assert.equal(calls[0][1].profile, 'web');
  assert.equal(calls[0][1].useTmux, true);
  assert.deepEqual(calls[1][1], { target: { id: 'mb', ssh: 'macbook' }, remotePort: 4000, localPort: 0 });
  await channel.close('mb');
  assert.equal(calls[2], 'tunnel-close');
  assert.equal(calls[3][0], 'stop');
});

test('open defaults profile and local port to the host row and lets options win', async () => {
  const { channel, calls } = fixture({ hosts: [{ id: 'mb', ssh: 'macbook', webProfile: 'sdk', webPort: 3080 }] });
  const info = await channel.open('mb', {});
  assert.equal(info.profile, 'sdk');
  assert.equal(calls[0][1].profile, 'sdk');
  assert.equal(calls[1][1].localPort, 3080);

  const second = fixture({ hosts: [{ id: 'mb', ssh: 'macbook', webProfile: 'sdk', webPort: 3080 }] });
  const info2 = await second.channel.open('mb', { profile: 'custom', localPort: 3090, useTmux: false });
  assert.equal(info2.profile, 'custom');
  assert.equal(second.calls[0][1].profile, 'custom');
  assert.equal(second.calls[0][1].useTmux, false);
  assert.equal(second.calls[1][1].localPort, 3090);
});

test('open merges the remote and tunnel notes into one Chinese message', async () => {
  const { channel } = fixture({
    remote: { note: '远端没有 tmux，已用 nohup 启动', tmux: false },
    tunneled: { localPort: 3081, note: '端口 3080 已被占用，已改用 3081' },
  });
  const info = await channel.open('mb', { localPort: 3080 });
  assert.equal(info.note, '远端没有 tmux，已用 nohup 启动；端口 3080 已被占用，已改用 3081');
  assert.equal(info.localPort, 3081);
  assert.equal(info.tmux, false);
});

test('attaching an existing instance never starts or stops a remote process', async () => {
  const { channel, calls } = fixture();
  const info = await channel.open('mb', { attachUrl: 'http://127.0.0.1:3088/?token=existing', localPort: 3081 });
  assert.deepEqual(info, {
    hostId: 'mb',
    url: 'http://127.0.0.1:5500/?token=existing',
    profile: null,
    localPort: 5500,
    remotePort: 3088,
    tmux: false,
    external: true,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'tunnel');
  assert.equal(calls[0][1].remotePort, 3088);
  assert.equal(calls[0][1].localPort, 3081);
  await channel.close('mb');
  assert.deepEqual(calls.slice(1), ['tunnel-close']);
});

test('an open channel is cached and new parameters are ignored', async () => {
  const { channel, calls } = fixture();
  const first = await channel.open('mb', { profile: 'web' });
  const second = await channel.open('mb', { profile: 'sdk', localPort: 3095 });
  assert.equal(second, first);
  assert.equal(calls.filter((call) => call[0] === 'start').length, 1);
  await channel.close('mb');
});

test('concurrent opens share one remote start and one tunnel', async () => {
  const { channel, calls } = fixture();
  const [first, second] = await Promise.all([
    channel.open('mb', {}),
    channel.open('mb', { profile: 'sdk', localPort: 3095 }),
  ]);
  assert.equal(first, second);
  assert.equal(calls.filter((call) => call[0] === 'start').length, 1);
  assert.equal(calls.filter((call) => call[0] === 'tunnel').length, 1);
  await channel.close('mb');
});

test('a failed open does not poison the next attempt', async () => {
  let attempts = 0;
  const channel = createWebChannel({
    hosts: [{ id: 'mb', ssh: 'macbook' }],
    resolveDsh: async () => '/fake/dsh',
    runRemote: async () => '',
    remoteWeb: {
      start: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('remote dsh web did not report a URL in time');
        return { port: 4000, token: 'tok', tmux: true };
      },
      stop: async () => {},
    },
    tunnel: async () => ({ localPort: 5500, close: () => {} }),
  });
  await assert.rejects(channel.open('mb', {}), /did not report a URL/);
  const info = await channel.open('mb', {});
  assert.equal(info.url, 'http://127.0.0.1:5500/?token=tok');
  assert.equal(attempts, 2);
});

test('an attachUrl that is not a token URL is rejected', async () => {
  const { channel, calls } = fixture();
  await assert.rejects(channel.open('mb', { attachUrl: 'http://example.com/' }), /attachUrl must look like/);
  assert.deepEqual(calls, []);
});

test('unknown hosts are rejected', async () => {
  const { channel } = fixture();
  await assert.rejects(channel.open('nope', {}), /unknown remote host: nope/);
});

test('dispose closes every open channel', async () => {
  const { channel, calls } = fixture();
  await channel.open('mb', {});
  await channel.dispose();
  assert.deepEqual(calls.slice(2).map((call) => (Array.isArray(call) ? call[0] : call)), ['tunnel-close', 'stop']);
});
