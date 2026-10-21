import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApi } from '../lib/http-api.js';

function request(url, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = url;
  req.headers = { 'content-type': 'application/json' };
  let status = 200;
  let payload = '';
  const res = {
    setHeader() {},
    writeHead(code) { status = code; },
    end(chunk) { payload += chunk ?? ''; },
  };
  return { req, res, read: async () => { const handler = createApi(fakeManager); await handler(req, res); return { status, json: JSON.parse(payload) }; } };
}

const calls = [];
const fakeFs = {
  list: async (hostId, path) => ({ path, parent: '/home', dirs: ['app'] }),
};

const fakeManager = {
  connect: async (hostId, project) => { calls.push(['connect', hostId, project]); return { hostId, project }; },
  createSession: () => ({ id: 'session-new' }),
  prompt: async (hostId, project, sessionId, text) => { calls.push(['prompt', hostId, project, sessionId, text]); return { messageId: 'm1' }; },
  sessionState: () => ({ messages: [], running: true }),
  listSessions: async () => [{ id: 'session-old' }],
  readHistory: async () => [{ role: 'user', text: 'hi', time: 1 }],
};

test('api routes connect, prompt, history and rejects unknown endpoints', async () => {
  const hosts = [{ id: 'mb', label: 'macbook' }];
  const api = (url, body) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    req.method = 'POST'; req.url = url; req.headers = {};
    let payload = '';
    const res = { setHeader() {}, writeHead() {}, end(chunk) { payload += chunk ?? ''; } };
    return createApi({ manager: fakeManager, hosts, fs: fakeFs })(req, res).then(() => JSON.parse(payload));
  };
  assert.deepEqual(await api('/remote-pure/api/hosts', {}), { hosts });
  assert.deepEqual(await api('/remote-pure/api/connect', { hostId: 'mb', project: '/home/me/app' }), { hostId: 'mb', project: '/home/me/app' });
  assert.deepEqual(await api('/remote-pure/api/new-session', { hostId: 'mb', project: '/p' }), { sessionId: 'session-new' });
  assert.deepEqual(await api('/remote-pure/api/prompt', { hostId: 'mb', project: '/p', sessionId: 's', text: 'go' }), { messageId: 'm1' });
  assert.deepEqual(await api('/remote-pure/api/history', { hostId: 'mb', project: '/p', sessionId: 's' }), { messages: [{ role: 'user', text: 'hi', time: 1 }] });
  assert.deepEqual(await api('/remote-pure/api/browse', { hostId: 'mb', path: '/home' }), { path: '/home', parent: '/home', dirs: ['app'] });
  const missing = await api('/remote-pure/api/nope', {});
  assert.equal(missing.error.code, 'unknown-endpoint');
});
