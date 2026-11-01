import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApi } from '../lib/http-api.js';

const HOSTS = [{ id: 'mb', label: 'macbook', discovered: false, webProfile: 'web', webPort: 0 }];

function makeApi(overrides = {}) {
  const calls = [];
  const manager = {
    connect: async (hostId, project) => { calls.push(['connect', hostId, project]); return { hostId, project }; },
    createSession: () => ({ id: 'session-new' }),
    prompt: async (hostId, project, sessionId, text) => { calls.push(['prompt', hostId, project, sessionId, text]); return { messageId: 'm1' }; },
    sessionState: () => ({ messages: [], running: true }),
    listSessions: async () => [{ id: 'session-old' }],
    readHistory: async () => [{ role: 'user', text: 'hi', time: 1 }],
    disconnect: (hostId, project) => { calls.push(['disconnect', hostId, project]); },
  };
  const fs = {
    list: async (hostId, path) => ({ path, parent: '/home', dirs: ['app'] }),
    mkdir: async (hostId, path) => path,
  };
  const updater = {
    check: async () => ({ updateAvailable: false, current: '0.12.0' }),
    apply: async () => ({ application: 'skipped' }),
  };
  const profiles = {
    list: async (hostId) => ({ hostId, profiles: [{ name: 'web', web: true, sdk: false }], defaultProfile: 'web' }),
  };
  const webChannel = {
    open: async (hostId, options) => {
      calls.push(['web-open', hostId, options]);
      return {
        hostId,
        url: 'http://127.0.0.1:5500/?token=tok',
        profile: options.attachUrl === undefined ? (options.profile ?? 'web') : null,
        localPort: 5500,
        remotePort: 4000,
        tmux: options.useTmux,
        external: options.attachUrl !== undefined,
        ...(options.localPort === 3080 ? { note: '端口 3080 已被占用，已改用 5500' } : {}),
      };
    },
    close: async (hostId) => { calls.push(['web-close', hostId]); return { closed: true }; },
  };
  const api = createApi({ manager, hosts: HOSTS, fs, updater, profiles, webChannel, ...overrides });
  return { api, calls };
}

async function call(api, url, body = {}) {
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
  await api(req, res);
  return { status, json: payload === '' ? null : JSON.parse(payload) };
}

test('api routes the existing panel calls and rejects unknown endpoints', async () => {
  const { api } = makeApi();
  assert.deepEqual((await call(api, '/remote-pure/api/hosts')).json, { hosts: HOSTS });
  assert.deepEqual((await call(api, '/remote-pure/api/connect', { hostId: 'mb', project: '/home/me/app' })).json, { hostId: 'mb', project: '/home/me/app' });
  assert.deepEqual((await call(api, '/remote-pure/api/new-session', { hostId: 'mb', project: '/p' })).json, { sessionId: 'session-new' });
  assert.deepEqual((await call(api, '/remote-pure/api/prompt', { hostId: 'mb', project: '/p', sessionId: 's', text: 'go' })).json, { messageId: 'm1' });
  assert.deepEqual((await call(api, '/remote-pure/api/history', { hostId: 'mb', project: '/p', sessionId: 's' })).json, { messages: [{ role: 'user', text: 'hi', time: 1 }] });
  assert.deepEqual((await call(api, '/remote-pure/api/browse', { hostId: 'mb', path: '/home' })).json, { path: '/home', parent: '/home', dirs: ['app'] });
  assert.deepEqual((await call(api, '/remote-pure/api/mkdir', { hostId: 'mb', path: '~/new' })).json, { path: '~/new' });
  assert.deepEqual((await call(api, '/remote-pure/api/update-check')).json, { updateAvailable: false, current: '0.12.0' });
  assert.deepEqual((await call(api, '/remote-pure/api/disconnect', { hostId: 'mb', project: '/p' })).json, { ok: true });
  const missing = await call(api, '/remote-pure/api/nope');
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.code, 'unknown-endpoint');
});

test('api exposes the remote profile lister per host', async () => {
  const { api } = makeApi();
  const listed = await call(api, '/remote-pure/api/profiles', { hostId: 'mb' });
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.json, { hostId: 'mb', profiles: [{ name: 'web', web: true, sdk: false }], defaultProfile: 'web' });
  const missing = await call(api, '/remote-pure/api/profiles', {});
  assert.equal(missing.status, 400);
  assert.match(missing.json.error.message, /hostId/);
});

test('web-open forwards profile, local port and attachUrl untouched', async () => {
  const { api, calls } = makeApi();
  const opened = await call(api, '/remote-pure/api/web-open', { hostId: 'mb', useTmux: true, profile: 'sdk', localPort: 3080 });
  assert.equal(opened.status, 200);
  assert.equal(opened.json.profile, 'sdk');
  assert.equal(opened.json.note, '端口 3080 已被占用，已改用 5500');
  assert.deepEqual(calls[calls.length - 1], ['web-open', 'mb', { useTmux: true, profile: 'sdk', localPort: 3080, attachUrl: undefined }]);

  const attached = await call(api, '/remote-pure/api/web-open', { hostId: 'mb', attachUrl: 'http://127.0.0.1:3088/?token=x', localPort: 3090 });
  assert.equal(attached.status, 200);
  assert.equal(attached.json.external, true);
  assert.deepEqual(calls[calls.length - 1], ['web-open', 'mb', { useTmux: false, profile: undefined, localPort: 3090, attachUrl: 'http://127.0.0.1:3088/?token=x' }]);

  const closed = await call(api, '/remote-pure/api/web-close', { hostId: 'mb' });
  assert.deepEqual(closed.json, { closed: true });
});

test('web-open rejects invalid profile names with 400', async () => {
  const { api, calls } = makeApi();
  for (const profile of ['desktop', 'Desktop', 'bad name', '../web', '-lead', 'a'.repeat(65), 42]) {
    const response = await call(api, '/remote-pure/api/web-open', { hostId: 'mb', profile });
    assert.equal(response.status, 400, `profile ${String(profile)}`);
    assert.match(response.json.error.message, /profile/);
  }
  assert.deepEqual(calls, []);
});

test('web-open rejects invalid local ports with 400', async () => {
  const { api, calls } = makeApi();
  for (const localPort of [-1, 65536, 1.5, '3080', true]) {
    const response = await call(api, '/remote-pure/api/web-open', { hostId: 'mb', localPort });
    assert.equal(response.status, 400, `localPort ${String(localPort)}`);
    assert.match(response.json.error.message, /localPort/);
  }
  assert.deepEqual(calls, []);
});

test('web-open accepts 0, omission, null and an empty attachUrl as automatic', async () => {
  const { api, calls } = makeApi();
  assert.equal((await call(api, '/remote-pure/api/web-open', { hostId: 'mb' })).status, 200);
  assert.equal((await call(api, '/remote-pure/api/web-open', { hostId: 'mb', localPort: 0, profile: null, attachUrl: '' })).status, 200);
  assert.deepEqual(calls[0][2], { useTmux: false, profile: undefined, localPort: undefined, attachUrl: undefined });
  assert.deepEqual(calls[1][2], { useTmux: false, profile: undefined, localPort: 0, attachUrl: undefined });
});

test('handler keeps 405 for non-POST and 500 with the original error shape', async () => {
  const { api } = makeApi({ manager: { connect: async () => { throw new Error('boom'); } } });
  const req = Readable.from([]);
  req.method = 'GET';
  req.url = '/remote-pure/api/hosts';
  let status = 200;
  let payload = '';
  const res = { setHeader() {}, writeHead(code) { status = code; }, end(chunk) { payload += chunk ?? ''; } };
  await api(req, res);
  assert.equal(status, 405);
  assert.equal(JSON.parse(payload).error.code, 'method-not-allowed');

  const failed = await call(api, '/remote-pure/api/connect', { hostId: 'mb', project: '/p' });
  assert.equal(failed.status, 500);
  assert.equal(failed.json.error.message, 'boom');
});
