import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWebUrl, launchScript } from '../lib/remote-web.js';

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
