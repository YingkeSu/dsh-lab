import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTunnel, isLocalPort } from '../lib/tunnel.js';

/** Minimal ChildProcess stand-in: records listeners and can emit `exit`. */
function fakeChild() {
  const listeners = new Map();
  const child = {
    killed: false,
    on(event, handler) {
      listeners.set(event, handler);
      return child;
    },
    kill() {
      child.killed = true;
    },
    emit(event) {
      listeners.get(event)?.();
    },
  };
  return child;
}

/** Injected spawner that records arguments and hands out fake children. */
function recorder() {
  const calls = [];
  const children = [];
  return {
    calls,
    children,
    spawn(args) {
      calls.push(args);
      const child = fakeChild();
      children.push(child);
      return child;
    },
  };
}

function argsPort(args) {
  const flag = args.indexOf('-L');
  return Number(args[flag + 1].split(':')[1]);
}

const target = { id: 'mb', ssh: 'macbook' };

test('isLocalPort accepts the 0..65535 integer range only', () => {
  assert.equal(isLocalPort(0), true);
  assert.equal(isLocalPort(3080), true);
  assert.equal(isLocalPort(65535), true);
  assert.equal(isLocalPort(-1), false);
  assert.equal(isLocalPort(65536), false);
  assert.equal(isLocalPort('3080'), false);
  assert.equal(isLocalPort(1.5), false);
});

test('uses a requested free port, forwards with ExitOnForwardFailure and releases it on close', async () => {
  const spawn = recorder();
  const tunnel = await createTunnel({
    target,
    remotePort: 51809,
    localPort: 3080,
    probePort: async () => true,
    findFreePort: async () => 3999,
    waitForPort: async () => true,
    spawn: spawn.spawn,
  });
  assert.equal(tunnel.localPort, 3080);
  assert.equal(tunnel.requestedLocalPort, 3080);
  assert.equal(tunnel.note, undefined);
  const [args] = spawn.calls;
  assert.ok(args.includes('-o'));
  assert.ok(args.includes('ExitOnForwardFailure=yes'));
  assert.equal(argsPort(args), 3080);
  assert.equal(args[args.indexOf('-L') + 1], '127.0.0.1:3080:127.0.0.1:51809');
  tunnel.close();
  assert.equal(spawn.children[0].killed, true);
});

test('falls back to a free port when the requested one is busy, with a Chinese note', async () => {
  const spawn = recorder();
  let excluded;
  const tunnel = await createTunnel({
    target,
    remotePort: 51809,
    localPort: 3081,
    probePort: async () => false,
    findFreePort: async (ports) => {
      excluded = ports;
      return 4001;
    },
    waitForPort: async () => true,
    spawn: spawn.spawn,
  });
  assert.equal(tunnel.localPort, 4001);
  assert.equal(tunnel.requestedLocalPort, 3081);
  assert.equal(tunnel.note, '端口 3081 已被占用，已改用 4001');
  assert.ok(excluded instanceof Set);
  assert.equal(argsPort(spawn.calls[0]), 4001);
  tunnel.close();
});

test('treats a port held by another tunnel as busy even when the OS could bind it', async () => {
  const firstSpawn = recorder();
  const first = await createTunnel({
    target,
    remotePort: 51809,
    localPort: 3082,
    probePort: async () => true,
    findFreePort: async () => 4002,
    waitForPort: async () => true,
    spawn: firstSpawn.spawn,
  });
  const secondSpawn = recorder();
  const second = await createTunnel({
    target: { id: 'wry', ssh: 'wry' },
    remotePort: 51810,
    localPort: 3082,
    probePort: async () => true,
    findFreePort: async () => 4003,
    waitForPort: async () => true,
    spawn: secondSpawn.spawn,
  });
  assert.equal(second.localPort, 4003);
  assert.equal(second.note, '端口 3082 已被占用，已改用 4003');
  second.close();
  first.close();

  // Closing released the port: the next request for it succeeds unchanged.
  const thirdSpawn = recorder();
  const third = await createTunnel({
    target,
    remotePort: 51809,
    localPort: 3082,
    probePort: async () => true,
    findFreePort: async () => 4004,
    waitForPort: async () => true,
    spawn: thirdSpawn.spawn,
  });
  assert.equal(third.localPort, 3082);
  assert.equal(third.note, undefined);
  third.close();
});

test('retries on a free port when ssh never forwards the requested port', async () => {
  const spawn = recorder();
  const waits = [false, true];
  const tunnel = await createTunnel({
    target,
    remotePort: 51809,
    localPort: 3083,
    probePort: async () => true,
    findFreePort: async () => 4005,
    waitForPort: async () => waits.shift(),
    spawn: spawn.spawn,
  });
  assert.equal(spawn.calls.length, 2);
  assert.equal(argsPort(spawn.calls[0]), 3083);
  assert.equal(argsPort(spawn.calls[1]), 4005);
  assert.equal(tunnel.localPort, 4005);
  assert.equal(tunnel.requestedLocalPort, 3083);
  assert.equal(tunnel.note, '端口 3083 未能建立 SSH 隧道，已改用 4005');
  tunnel.close();
});

test('throws when no port can be forwarded and frees every reserved port', async () => {
  const spawn = recorder();
  await assert.rejects(
    createTunnel({
      target,
      remotePort: 51809,
      localPort: 3084,
      probePort: async () => true,
      findFreePort: async () => 4006,
      waitForPort: async () => false,
      spawn: spawn.spawn,
    }),
    /did not become ready on 127\.0\.0\.1:4006/,
  );
  // Both the requested and the fallback port were released.
  const retrySpawn = recorder();
  const retry = await createTunnel({
    target,
    remotePort: 51809,
    localPort: 3084,
    probePort: async () => true,
    findFreePort: async () => 4007,
    waitForPort: async () => true,
    spawn: retrySpawn.spawn,
  });
  assert.equal(retry.localPort, 3084);
  assert.equal(retry.note, undefined);
  retry.close();
});

test('an automatic port uses the picker and reports no note or requested port', async () => {
  const spawn = recorder();
  const tunnel = await createTunnel({
    target,
    remotePort: 51809,
    localPort: 0,
    probePort: async () => true,
    findFreePort: async () => 4008,
    waitForPort: async () => true,
    spawn: spawn.spawn,
  });
  assert.equal(tunnel.localPort, 4008);
  assert.equal('requestedLocalPort' in tunnel, false);
  assert.equal('note' in tunnel, false);
  assert.equal(argsPort(spawn.calls[0]), 4008);
  tunnel.close();
});

test('reconnects on the same local port after an unexpected ssh exit', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const spawn = recorder();
  const tunnel = await createTunnel({
    target,
    remotePort: 51809,
    localPort: 3085,
    probePort: async () => true,
    findFreePort: async () => 4009,
    waitForPort: async () => true,
    spawn: spawn.spawn,
  });
  spawn.children[0].emit('exit');
  t.mock.timers.tick(500);
  assert.equal(spawn.calls.length, 2);
  assert.equal(argsPort(spawn.calls[1]), 3085);
  tunnel.close();
  assert.equal(spawn.children[1].killed, true);
});
