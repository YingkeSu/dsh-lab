/**
 * Remote project lifecycle: one SSH-hosted `dsh --profile sdk` runtime per
 * (host, project). The remote runtime is the only writer of session logs; the
 * local side holds chat state for the panel and reads history on demand.
 */
import { randomUUID } from 'node:crypto';
import { createSdkClient } from './sdk-client.js';
import { decodeSessionLog, normalizeRemotePath, projectDirName, readMessages } from './remote-log.js';
import { shellQuote, sshRun, sshSpawn } from './ssh.js';

const DEFAULT_DSH_HOME = '$HOME/.dsh';
const EVENT_LIMIT = 400;
const SESSION_ID = /^[A-Za-z0-9._-]+$/;

/** Quote a remote path while letting a configured `$HOME` prefix expand. */
function remotePath(value) {
  const text = String(value);
  if (text === '$HOME') return '"$HOME"';
  if (text.startsWith('$HOME/')) return `"$HOME"${shellQuote(text.slice(5))}`;
  return shellQuote(text);
}

function assertSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId) || sessionId.includes('..')) {
    throw new Error(`invalid remote session id: ${String(sessionId)}`);
  }
}

export function createManager({ hosts, spawn = sshSpawn, runRemote = sshRun }) {
  const byId = new Map(hosts.map((host) => [host.id, host]));
  const connections = new Map();
  const host = (hostId) => {
    const found = byId.get(hostId);
    if (found === undefined) throw new Error(`unknown remote host: ${hostId}`);
    return found;
  };
  const key = (hostId, project) => `${hostId}\u0000${normalizeRemotePath(project)}`;

  async function connect(hostId, project) {
    const target = host(hostId);
    const path = normalizeRemotePath(project);
    const id = key(hostId, path);
    const existing = connections.get(id);
    if (existing !== undefined) return existing.ready;
    const remoteCommand = `${target.dshCommand ?? 'dsh'} --profile sdk`;
    const { child } = spawn({ host: target, ssh: target.ssh, target, command: remoteCommand, argv: [] });
    const client = createSdkClient({ input: child.stdout, output: child.stdin });
    const connection = { info: { hostId, project: path }, client, child, sessions: new Map(), stderr: '', closed: false, ready: null };
    // Register before awaiting so a concurrent connect shares this attempt and
    // dispose/teardown can reach the child; a closed connection is dropped so a
    // later connect starts fresh instead of returning a dead handle.
    connections.set(id, connection);
    const drop = () => {
      connection.closed = true;
      if (connections.get(id) === connection) connections.delete(id);
    };
    child.on?.('error', drop);
    child.stdin?.on?.('error', drop);
    client.onClose(drop);
    child.stderr?.setEncoding?.('utf8');
    child.stderr?.on?.('data', (chunk) => { connection.stderr = (connection.stderr + chunk).slice(-4000); });
    const route = { provider: target.provider ?? 'deepseek-official', model: target.model ?? 'deepseek-flash' };
    connection.ready = (async () => {
      try {
        await client.request('initialize', { cwd: path, ...route }, target.connectTimeoutMs ?? 30000);
      } catch (error) {
        drop();
        client.close();
        child.kill?.('SIGTERM');
        throw new Error(`remote initialize failed (${hostId}:${path}): ${error.message}${connection.stderr ? `\n${connection.stderr.slice(-500)}` : ''}`);
      }
      client.onNotification((method, params) => {
        if (method !== 'session.event' && method !== 'session.status') return;
        const session = connection.sessions.get(params?.sessionId);
        if (session === undefined) return;
        session.updatedAt = Date.now();
        if (method === 'session.event') {
          session.events.push(params.event);
          if (session.events.length > EVENT_LIMIT) session.events.shift();
          const [message] = readMessages([params.event]);
          if (message !== undefined) session.messages.push(message);
        } else {
          session.running = params.status === 'running';
        }
      });
      return connection.info;
    })();
    return connection.ready;
  }

  function requireConnection(hostId, project) {
    const connection = connections.get(key(hostId, project));
    if (connection === undefined) throw new Error(`remote project is not connected: ${hostId}:${normalizeRemotePath(project)}`);
    return connection;
  }

  function createSession(hostId, project) {
    const connection = requireConnection(hostId, project);
    const session = { id: `session-${randomUUID()}`, messages: [], events: [], running: false, updatedAt: Date.now() };
    connection.sessions.set(session.id, session);
    return { id: session.id };
  }

  async function prompt(hostId, project, sessionId, text) {
    const connection = requireConnection(hostId, project);
    assertSessionId(sessionId);
    let session = connection.sessions.get(sessionId);
    if (session === undefined) {
      // A session listed from the remote store is resumed once by id; concurrent
      // prompts await the same resume and a failed resume is not cached.
      const resumed = connection.client.request('session/resume', { sessionId }).catch((error) => {
        connection.sessions.delete(sessionId);
        throw error;
      });
      session = { id: sessionId, messages: [], events: [], running: false, updatedAt: Date.now(), resume: resumed };
      connection.sessions.set(sessionId, session);
    }
    if (session.resume !== undefined) await session.resume;
    session.running = true;
    try {
      return await connection.client.request('session/prompt', { sessionId, contentBlocks: [{ type: 'text', text }] });
    } catch (error) {
      session.running = false;
      throw error;
    }
  }

  function sessionState(hostId, project, sessionId) {
    const connection = requireConnection(hostId, project);
    const session = connection.sessions.get(sessionId);
    return {
      messages: session?.messages ?? [],
      running: session?.running ?? false,
      lastEvent: session?.events.at(-1)?.type ?? null,
    };
  }

  /** List durable sessions for the remote project, newest first. */
  async function listSessions(hostId, project) {
    const target = host(hostId);
    const dir = `${target.dshHome ?? DEFAULT_DSH_HOME}/sessions/${projectDirName(project)}`;
    const output = await runRemote({ host: target, ssh: target.ssh, target, command: `ls -1t ${remotePath(dir)} 2>/dev/null || true` });
    return output.split('\n')
      .map((line) => line.trim())
      .filter((name) => /^session-[0-9a-f-]+$/.test(name))
      .map((name) => ({ id: name }));
  }

  /** Read one remote session log on demand; nothing is written locally. */
  async function readHistory(hostId, project, sessionId) {
    assertSessionId(sessionId);
    const target = host(hostId);
    const dir = `${target.dshHome ?? DEFAULT_DSH_HOME}/sessions/${projectDirName(project)}/${sessionId}`;
    const files = (await runRemote({ host: target, ssh: target.ssh, target, command: `ls -1 ${remotePath(dir)} 2>/dev/null || true` }))
      .split('\n').map((line) => line.trim())
      .filter((name) => /^session(\.v\d+)?\.jsonl(\.zstd)?$/.test(name));
    if (files.length === 0) return [];
    const latest = files.sort((a, b) => versionOf(b) - versionOf(a))[0];
    const encoded = await runRemote({ host: target, ssh: target.ssh, target, command: `base64 < ${remotePath(`${dir}/${latest}`)}` });
    return readMessages(decodeSessionLog(Buffer.from(encoded, 'base64')));
  }

  function disconnect(hostId, project) {
    const id = key(hostId, project);
    const connection = connections.get(id);
    if (connection === undefined) return;
    connections.delete(id);
    connection.client.close();
    connection.child.kill?.('SIGTERM');
  }

  function dispose() {
    for (const connection of connections.values()) {
      connection.client.close();
      connection.child.kill?.('SIGTERM');
    }
    connections.clear();
  }

  return { connect, createSession, prompt, sessionState, listSessions, readHistory, disconnect, dispose };
}

function versionOf(name) {
  const match = /\.v(\d+)\./.exec(name);
  return match === null ? 0 : Number(match[1]);
}
