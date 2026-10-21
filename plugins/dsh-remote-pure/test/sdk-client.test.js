import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createSdkClient } from '../lib/sdk-client.js';

/** A fake SDK runtime that answers by method name; writes newline frames. */
function fakeServer(input, output, handler) {
  let buffer = '';
  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      const reply = handler(msg);
      if (reply) output.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: reply }) + '\n');
    }
  });
}

test('sdk client sends a request and resolves its matching response', async () => {
  const toServer = new PassThrough();
  const fromServer = new PassThrough();
  fakeServer(toServer, fromServer, (msg) => (msg.method === 'initialize' ? { serverInfo: { name: 'fake' } } : undefined));
  const client = createSdkClient({ input: fromServer, output: toServer });
  const result = await client.request('initialize', { cwd: '/tmp', provider: 'p', model: 'm' });
  assert.equal(result.serverInfo.name, 'fake');
  client.close();
});

test('sdk client delivers notifications and settles concurrent requests by id', async () => {
  const toServer = new PassThrough();
  const fromServer = new PassThrough();
  fakeServer(toServer, fromServer, (msg) => ({ echo: msg.method }));
  const client = createSdkClient({ input: fromServer, output: toServer });
  const seen = [];
  client.onNotification((method, params) => seen.push([method, params]));
  fromServer.write(JSON.stringify({ jsonrpc: '2.0', method: 'session.event', params: { sessionId: 's1' } }) + '\n');
  const [a, b] = await Promise.all([client.request('session/prompt', {}), client.request('session/wait', {})]);
  assert.deepEqual([a.echo, b.echo], ['session/prompt', 'session/wait']);
  assert.deepEqual(seen, [['session.event', { sessionId: 's1' }]]);
  client.close();
});

test('sdk client rejects pending requests when the remote stream ends', async () => {
  const toServer = new PassThrough();
  const fromServer = new PassThrough();
  const client = createSdkClient({ input: fromServer, output: toServer });
  const pending = client.request('session/prompt', {});
  fromServer.end();
  await assert.rejects(pending, /closed|ended|disconnect/i);
});
