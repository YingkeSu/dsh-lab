import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWebUrl, launchScript, startRemoteWeb } from '../lib/remote-web.js';

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

function startFixture({ tmux = false } = {}) {
  const commands = [];
  const runRemote = async ({ command }) => {
    commands.push(command);
    if (command.startsWith('command -v tmux ')) return tmux ? 'yes\n' : 'no\n';
    if (command.startsWith('grep -o ')) return 'dsh web: http://127.0.0.1:51809/?token=abc_123\n';
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
  assert.match(commands[0], /\/fake\/dsh web --no-open --port 0/);
});

test('startRemoteWeb passes a requested profile through tmux and nohup', async () => {
  const nohup = startFixture();
  await startRemoteWeb({ target: { id: 'mb', ssh: 'macbook' }, command: '/fake/dsh', useTmux: false, runRemote: nohup.runRemote, profile: 'sdk' });
  assert.match(nohup.commands[0], /\/fake\/dsh sdk --no-open --port 0/);

  const tmux = startFixture({ tmux: true });
  const handle = await startRemoteWeb({ target: { id: 'mb', ssh: 'macbook' }, command: '/fake/dsh', useTmux: true, runRemote: tmux.runRemote, profile: 'work' });
  assert.equal(handle.tmux, true);
  assert.match(tmux.commands[1], /tmux new-session -d -s 'dsh-remote-pure-mb'/);
  assert.match(tmux.commands[1], /\/fake\/dsh work --no-open --port 0/);
});

test('startRemoteWeb validates the profile before touching the remote host', async () => {
  const { commands, runRemote } = startFixture();
  await assert.rejects(
    startRemoteWeb({ target: { id: 'mb', ssh: 'macbook' }, command: 'dsh', useTmux: false, runRemote, profile: 'desktop' }),
    /invalid dsh profile/,
  );
  assert.deepEqual(commands, []);
});
