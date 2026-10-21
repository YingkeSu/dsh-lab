import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createManager } from '../lib/manager.js';

/** Fake remote runtime: answers initialize/prompt/wait, pushes one assistant event. */
function fakeRuntime(toServer, fromServer) {
  let buf = '';
  const send = (message) => fromServer.write(JSON.stringify(message) + '\n');
  toServer.setEncoding('utf8');
  toServer.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { serverInfo: { name: 'sdk' } } });
      if (msg.method === 'session/prompt') {
        send({ jsonrpc: '2.0', id: msg.id, result: { messageId: 'm1' } });
        send({ jsonrpc: '2.0', method: 'session.event', params: { sessionId: msg.params.sessionId, event: { type: 'assistant/message', time: 5, data: { message: { content: [{ type: 'text', text: 'done' }] } } } } });
        send({ jsonrpc: '2.0', method: 'session.status', params: { sessionId: msg.params.sessionId, status: 'idle' } });
      }
      if (msg.method === 'session/resume') send({ jsonrpc: '2.0', id: msg.id, result: {} });
      if (msg.method === 'session/wait') send({ jsonrpc: '2.0', id: msg.id, result: {} });
    }
  });
}

const spawned = { argv: [] };
function fakeSpawn({ host, command }) {
  spawned.argv = ['ssh', host, command];
  const toServer = new PassThrough();
  const fromServer = new PassThrough();
  fakeRuntime(toServer, fromServer);
  return {
    child: { stdin: toServer, stdout: fromServer, stderr: new PassThrough(), kill() {}, on() {}, once() {} },
    argv: ['ssh', host, command],
  };
}

test('prompting a remote project streams its session events back to the caller', async () => {
  const manager = createManager({
    hosts: [{ id: 'mb', ssh: 'macbook', dshCommand: 'dsh' }],
    spawn: fakeSpawn,
    runRemote: async () => '',
  });
  const connection = await manager.connect('mb', '/home/me/app');
  assert.match(spawned.argv[2], /--profile sdk$/);
  assert.equal(connection.project, '/home/me/app');
  const session = manager.createSession('mb', '/home/me/app');
  const reply = await manager.prompt('mb', '/home/me/app', session.id, 'do it');
  assert.deepEqual(reply, { messageId: 'm1' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const state = manager.sessionState('mb', '/home/me/app', session.id);
  assert.deepEqual(state.messages.map((m) => [m.role, m.text]), [['assistant', 'done']]);
  assert.equal(state.running, false);
  manager.dispose();
});

test('prompting a session listed from remote history resumes it first', async () => {
  const order = [];
  const manager = createManager({
    hosts: [{ id: 'mb', ssh: 'macbook', dshCommand: 'dsh' }],
    spawn: ({ host, command }) => {
      const toServer = new PassThrough();
      const fromServer = new PassThrough();
      let buf = '';
      const send = (message) => fromServer.write(JSON.stringify(message) + '\n');
      toServer.setEncoding('utf8');
      toServer.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          order.push(msg.method);
          send({ jsonrpc: '2.0', id: msg.id, result: msg.method === 'initialize' ? {} : { messageId: 'm2' } });
        }
      });
      return { child: { stdin: toServer, stdout: fromServer, stderr: new PassThrough(), kill() {}, on() {}, once() {} }, argv: ['ssh', host, command] };
    },
    runRemote: async () => '',
  });
  await manager.connect('mb', '/p');
  await manager.prompt('mb', '/p', 'session-old-1', 'continue');
  assert.deepEqual(order, ['initialize', 'session/resume', 'session/prompt']);
  manager.dispose();
});


test('concurrent connects to the same project share one ssh runtime', async () => {
  let spawns = 0;
  const manager = createManager({
    hosts: [{ id: 'mb', ssh: 'macbook', dshCommand: 'dsh' }],
    spawn: ({ host, command }) => {
      spawns += 1;
      const toServer = new PassThrough();
      const fromServer = new PassThrough();
      fakeRuntime(toServer, fromServer);
      return { child: { stdin: toServer, stdout: fromServer, stderr: new PassThrough(), kill() {}, on() {}, once() {} }, argv: ['ssh', host, command] };
    },
    runRemote: async () => '',
  });
  const [a, b] = await Promise.all([manager.connect('mb', '/p'), manager.connect('mb', '/p')]);
  assert.equal(spawns, 1);
  assert.deepEqual(a, b);
  manager.dispose();
});

test('readHistory rejects unsafe session ids before touching the remote host', async () => {
  const manager = createManager({
    hosts: [{ id: 'mb', ssh: 'macbook', dshCommand: 'dsh' }],
    spawn: () => { throw new Error('should not connect'); },
    runRemote: async () => { throw new Error('should not run'); },
  });
  await assert.rejects(manager.readHistory('mb', '/p', '../escape'), /invalid remote session id/);
});
