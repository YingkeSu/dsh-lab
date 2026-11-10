import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWebUrl, launchScript, startRemoteWeb, stopRemoteWeb } from '../lib/remote-web.js';

test('parseWebUrl extracts the remote port and token', () => {
  assert.deepEqual(parseWebUrl('dsh web: http://127.0.0.1:51809/?token=abc_123-x\n'), { port: 51809, token: 'abc_123-x', url: 'http://127.0.0.1:51809/?token=abc_123-x' });
  assert.equal(parseWebUrl('no url here'), null);
});

test('launchScript starts a detached dsh web with tmux or nohup', () => {
  const common = { command: '/Users/me/bin/dsh', log: '$HOME/.dsh/remote-pure/web.log', dir: '$HOME/.dsh/remote-pure', sessionName: 'dsh-rp' };
  const tmux = launchScript({ ...common, useTmux: true });
  assert.match(tmux, /mkdir -p/);
  assert.match(tmux, /tmux new-session -d -s 'dsh-rp'/);
  assert.match(tmux, /--no-open --port 0/);
  const nohup = launchScript({ ...common, useTmux: false });
  assert.match(nohup, /nohup env \/Users\/me\/bin\/dsh web --no-open --port 0 > "\$HOME"'\/\.dsh\/remote-pure\/web\.log' 2>&1/);
  assert.match(nohup, /echo \$!/);
});

test('launchScript runs the requested dsh profile in both tmux and nohup modes', () => {
  const common = { command: '/Users/me/bin/dsh', log: '$HOME/.dsh/remote-pure/web.log', dir: '$HOME/.dsh/remote-pure', sessionName: 'dsh-rp', profile: 'sdk' };
  assert.match(launchScript({ ...common, useTmux: true }), /\/Users\/me\/bin\/dsh sdk --no-open --port 0/);
  assert.match(launchScript({ ...common, useTmux: false }), /nohup env \/Users\/me\/bin\/dsh sdk --no-open --port 0/);
});

test('launchScript rejects profiles that could inject into the remote shell', () => {
  const common = { command: 'dsh', log: '$HOME/.dsh/log', dir: '$HOME/.dsh', useTmux: false, sessionName: 's' };
  for (const profile of ['desktop', 'Desktop', 'bad name', 'web; rm -rf ~', '--profile', '', 'a'.repeat(65)]) {
    assert.throws(() => launchScript({ ...common, profile }), /invalid dsh profile/);
  }
});


const LIVE_URL = 'dsh web: http://127.0.0.1:51809/?token=abc_123\n';
const STALE_URL = 'dsh web: http://127.0.0.1:9/?token=stale_token\n';

/**
 * A remote host double: the tmux session, the log and the HTTP probe answer
 * from flags the test controls. `logUrl` is what the log already holds before
 * the launch; `launchUrls` is what successive reads return once it has started
 * (a relaunch can still show the previous line before its redirect runs).
 */
function startFixture({ tmux = false, session = false, logUrl = '', launchUrls = [LIVE_URL], deadPorts = [9], httpCode = null, launchError = null } = {}) {
  const commands = [];
  let launched = false;
  let reads = 0;
  const runRemote = async ({ command }) => {
    commands.push(command);
    if (command.startsWith('command -v tmux ')) return tmux ? 'yes\n' : 'no\n';
    if (command.includes('tmux has-session ')) return session ? 'yes\n' : 'no\n';
    if (command.includes('curl -s -o /dev/null')) {
      if (httpCode !== null) return httpCode;
      const port = /127\.0\.0\.1:(\d+)\//.exec(command);
      return port !== null && deadPorts.includes(Number(port[1])) ? '000' : '200';
    }
    if (command.includes('tmux kill-session')) {
      session = false;
      return '';
    }
    if (command.includes('tmux new-session')) {
      session = true;
      launched = true;
      if (launchError !== null) throw new Error(launchError);
      return '';
    }
    if (command.includes('nohup env ')) {
      launched = true;
      return '4242\n';
    }
    if (command.includes('grep -o ')) {
      if (!launched) return logUrl;
      const value = launchUrls[Math.min(reads, launchUrls.length - 1)];
      reads += 1;
      return value;
    }
    return '';
  };
  return { commands, runRemote };
}

test('startRemoteWeb defaults to the web profile so the remote command is unchanged', async () => {
  const { commands, runRemote } = startFixture();
  const handle = await startRemoteWeb({ target: { id: 'mb', ssh: 'macbook' }, command: '/fake/dsh', useTmux: false, runRemote });
  assert.equal(handle.port, 51809);
  assert.equal(handle.token, 'abc_123');
  assert.equal(handle.tmux, false);
  const launch = commands.find((command) => command.includes('nohup env '));
  assert.match(launch, /\/fake\/dsh web --no-open --port 0/);
});

test('startRemoteWeb passes a requested profile through tmux and nohup', async () => {
  const nohup = startFixture();
  await startRemoteWeb({ target: { id: 'mb', ssh: 'macbook' }, command: '/fake/dsh', useTmux: false, runRemote: nohup.runRemote, profile: 'sdk' });
  assert.match(nohup.commands.find((command) => command.includes('nohup env ')), /\/fake\/dsh sdk --no-open --port 0/);

  const tmux = startFixture({ tmux: true });
  const handle = await startRemoteWeb({ target: { id: 'mb', ssh: 'macbook' }, command: '/fake/dsh', useTmux: true, runRemote: tmux.runRemote, profile: 'work' });
  assert.equal(handle.tmux, true);
  const create = tmux.commands.find((command) => command.includes('tmux new-session'));
  assert.match(create, /tmux new-session -d -s 'dsh-remote-pure-mb'/);
  assert.match(create, /\/fake\/dsh work --no-open --port 0/);
});

test('startRemoteWeb reuses a healthy session left by an earlier local process', async () => {
  const { commands, runRemote } = startFixture({ tmux: true, session: true, logUrl: LIVE_URL });
  const handle = await startRemoteWeb({ target: { id: 'lab', ssh: 'lab' }, command: '/fake/dsh', useTmux: true, runRemote });
  assert.equal(handle.port, 51809);
  assert.equal(handle.token, 'abc_123');
  assert.equal(handle.tmux, true);
  assert.equal(handle.sessionName, 'dsh-remote-pure-lab');
  assert.equal(handle.note, '已复用远端已在运行的 dsh web');
  assert.equal(commands.some((command) => command.includes('tmux new-session')), false);
  assert.equal(commands.some((command) => command.includes('tmux kill-session')), false);
});

test('startRemoteWeb reuses a session when curl is unavailable to probe the port', async () => {
  const { commands, runRemote } = startFixture({ tmux: true, session: true, logUrl: LIVE_URL, httpCode: 'unknown' });
  const handle = await startRemoteWeb({ target: { id: 'lab', ssh: 'lab' }, command: '/fake/dsh', useTmux: true, runRemote });
  assert.equal(handle.note, '已复用远端已在运行的 dsh web');
  assert.equal(commands.some((command) => command.includes('tmux new-session')), false);
});

test('startRemoteWeb replaces a stale session without adopting its URL', async () => {
  const { commands, runRemote } = startFixture({
    tmux: true,
    session: true,
    logUrl: STALE_URL,
    launchUrls: [STALE_URL, LIVE_URL],
  });
  const handle = await startRemoteWeb({ target: { id: 'lab', ssh: 'lab' }, command: '/fake/dsh', useTmux: true, runRemote });
  assert.equal(handle.port, 51809, 'the previous log line is not mistaken for the new server');
  assert.equal(handle.tmux, true);
  const kill = commands.findIndex((command) => command.includes('tmux kill-session'));
  const create = commands.findIndex((command) => command.includes('tmux new-session'));
  assert.notEqual(kill, -1);
  assert.notEqual(create, -1);
  assert.ok(kill < create, 'the stale session is killed before the replacement is created');
  assert.match(commands[kill], /tmux kill-session -t ='dsh-remote-pure-lab'/);
});

test('startRemoteWeb replaces a session with no URL in the log', async () => {
  const { commands, runRemote } = startFixture({ tmux: true, session: true, logUrl: '' });
  const handle = await startRemoteWeb({ target: { id: 'lab', ssh: 'lab' }, command: '/fake/dsh', useTmux: true, runRemote });
  assert.equal(handle.port, 51809);
  assert.equal(commands.some((command) => command.includes('tmux kill-session')), true);
  assert.equal(commands.some((command) => command.includes('tmux new-session')), true);
});

test('startRemoteWeb adopts the session another local open won the race to create', async () => {
  const { commands, runRemote } = startFixture({ tmux: true, launchError: 'duplicate session: dsh-remote-pure-lab' });
  const handle = await startRemoteWeb({ target: { id: 'lab', ssh: 'lab' }, command: '/fake/dsh', useTmux: true, runRemote });
  assert.equal(handle.tmux, true);
  assert.equal(handle.port, 51809);
  assert.equal(handle.note, '已复用远端已在运行的 dsh web');
  assert.equal(commands.some((command) => command.includes('tmux has-session')), true);
});

test('stopRemoteWeb kills only the exact session name', async () => {
  const commands = [];
  const runRemote = async ({ command }) => { commands.push(command); return ''; };
  await stopRemoteWeb({ target: { id: 'lab', ssh: 'lab' }, handle: { tmux: true, sessionName: 'dsh-remote-pure-lab' }, runRemote });
  assert.equal(commands.length, 1);
  assert.match(commands[0], /tmux kill-session -t ='dsh-remote-pure-lab'/);
});

test('startRemoteWeb validates the profile before touching the remote host', async () => {
  const { commands, runRemote } = startFixture();
  await assert.rejects(
    startRemoteWeb({ target: { id: 'mb', ssh: 'macbook' }, command: 'dsh', useTmux: false, runRemote, profile: 'desktop' }),
    /invalid dsh profile/,
  );
  assert.deepEqual(commands, []);
});
