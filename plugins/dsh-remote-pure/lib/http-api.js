/**
 * Host HTTP surface of the remote panel. The browser half calls these routes
 * through the same-origin web server; each call delegates to the manager.
 */
import { isLaunchableProfile } from './profiles.js';
import { isLocalPort } from './tunnel.js';

const MAX_BODY = 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim() === '') return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(Object.assign(new Error('invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, value) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.writeHead(status);
  res.end(JSON.stringify(value));
}

const str = (body, key) => {
  const value = body[key];
  if (typeof value !== 'string' || value.trim() === '') throw Object.assign(new Error(`\`${key}\` is required`), { status: 400 });
  return value;
};

/** Optional remote dsh profile for `/web-open`; invalid names are a 400. */
function profileOption(body) {
  const value = body.profile;
  if (value === undefined || value === null) return undefined;
  if (!isLaunchableProfile(value)) throw Object.assign(new Error('invalid `profile`'), { status: 400 });
  return value;
}

/** Optional local tunnel port for `/web-open`; 0 and omission both mean automatic. */
function localPortOption(body) {
  const value = body.localPort;
  if (value === undefined || value === null) return undefined;
  if (!isLocalPort(value)) throw Object.assign(new Error('invalid `localPort`'), { status: 400 });
  return value;
}

export function createApi({ manager, hosts, fs, updater, webChannel, profiles }) {
  const routes = {
    '/hosts': async () => ({ hosts }),
    '/profiles': async (body) => profiles.list(str(body, 'hostId')),
    '/connect': async (body) => manager.connect(str(body, 'hostId'), str(body, 'project')),
    '/disconnect': async (body) => {
      manager.disconnect(str(body, 'hostId'), str(body, 'project'));
      return { ok: true };
    },
    '/new-session': async (body) => {
      const { id } = manager.createSession(str(body, 'hostId'), str(body, 'project'));
      return { sessionId: id };
    },
    '/prompt': async (body) => manager.prompt(
      str(body, 'hostId'), str(body, 'project'), str(body, 'sessionId'), str(body, 'text'),
    ),
    '/state': async (body) => manager.sessionState(str(body, 'hostId'), str(body, 'project'), str(body, 'sessionId')),
    '/sessions': async (body) => ({ sessions: await manager.listSessions(str(body, 'hostId'), str(body, 'project')) }),
    '/mkdir': async (body) => ({ path: await fs.mkdir(str(body, 'hostId'), str(body, 'path')) }),
    '/browse': async (body) => fs.list(
      str(body, 'hostId'),
      typeof body.path === 'string' && body.path.trim() !== '' ? body.path : '~',
    ),
    '/history': async (body) => ({ messages: await manager.readHistory(str(body, 'hostId'), str(body, 'project'), str(body, 'sessionId')) }),
    '/web-open': async (body) => webChannel.open(str(body, 'hostId'), {
      useTmux: body.useTmux === true,
      profile: profileOption(body),
      localPort: localPortOption(body),
      attachUrl: typeof body.attachUrl === 'string' && body.attachUrl.trim() !== '' ? body.attachUrl : undefined,
    }),
    '/web-close': async (body) => webChannel.close(str(body, 'hostId')),
    '/update-check': async () => updater.check(),
    '/update': async () => updater.apply(),
  };

  return async function handle(req, res) {
    if (req.method !== 'POST') {
      send(res, 405, { error: { code: 'method-not-allowed', message: 'POST required' } });
      return;
    }
    const path = String(req.url ?? '').split('?')[0];
    const tail = path.slice(path.indexOf('/api') + 4);
    const route = routes[tail];
    try {
      if (route === undefined) {
        send(res, 404, { error: { code: 'unknown-endpoint', message: `unknown endpoint ${tail}` } });
        return;
      }
      const body = await readBody(req);
      send(res, 200, await route(body));
    } catch (error) {
      send(res, error.status ?? 500, { error: { code: 'request-failed', message: error.message } });
    }
  };
}
