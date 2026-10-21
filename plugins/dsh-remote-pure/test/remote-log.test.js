import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zstdCompressSync } from 'node:zlib';
import { decodeSessionLog, readMessages, projectDirName, normalizeRemotePath } from '../lib/remote-log.js';

const frame = (event) => zstdCompressSync(Buffer.from(JSON.stringify(event) + '\n', 'utf8'));

test('decodeSessionLog reads every concatenated zstd frame of a session log', () => {
  const log = Buffer.concat([
    frame({ type: 'session', version: 4, id: 's1', cwd: '/home/me/app' }),
    frame({ type: 'user/message', time: 1, data: { content: [{ type: 'text', text: 'hi' }] } }),
    frame({ type: 'assistant/message', time: 2, data: { message: { content: [{ type: 'reasoning', text: 'think' }, { type: 'text', text: 'hello' }] } } }),
  ]);
  const events = decodeSessionLog(log);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.type), ['session', 'user/message', 'assistant/message']);
});

test('readMessages keeps user and assistant text, not reasoning', () => {
  const events = [
    { type: 'user/message', time: 1, data: { content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } } },
    { type: 'user/message', time: 1, data: { content: [{ type: 'text', text: 'injected context' }], source: { kind: 'runtime-context' } } },
    { type: 'assistant/message', time: 2, data: { message: { content: [{ type: 'reasoning', text: 'think' }, { type: 'text', text: 'hello' }] } } },
    { type: 'tool/call', time: 3, data: { name: 'bash' } },
  ];
  assert.deepEqual(readMessages(events), [
    { role: 'user', text: 'hi', time: 1 },
    { role: 'assistant', text: 'hello', time: 2 },
  ]);
});

test('project dir name mirrors the harness cwd escaping and normalizes trailing slashes', () => {
  assert.equal(normalizeRemotePath('/home/me/app/'), '/home/me/app');
  assert.equal(normalizeRemotePath('//home//me/app//'), '/home/me/app');
  assert.equal(projectDirName('/home/me/app'), '--home-me-app--');
});
