// Real-machine check: drive the macbook remote DSH runtime through the plugin's manager.
import { createManager } from '../lib/manager.js';

// Fill in the SSH alias and the remote dsh command you want to check.
const host = {
  id: 'macbook',
  ssh: 'macbook',
  dshCommand: 'PATH=/opt/homebrew/bin:$PATH node $HOME/labs/ds/deepseek-harness/apps/cli/lib/bin.js',
  dshHome: '$HOME/.dsh',
  provider: 'deepseek-official',
  model: 'deepseek-flash',
};
const project = '/Users/suyingke/labs/ds/deepseek-harness';
const manager = createManager({ hosts: [host] });
const t0 = Date.now();
const fail = (message) => { console.error('FAIL', message); manager.dispose(); process.exit(1); };
setTimeout(() => fail('overall timeout 180s'), 180000).unref();

console.log('connect…');
const info = await manager.connect('macbook', project);
console.log('connected', info, Date.now() - t0, 'ms');

const sessions = await manager.listSessions('macbook', project);
console.log('remote sessions:', sessions.length, sessions.slice(0, 3).map((s) => s.id));

if (sessions.length > 0) {
  const history = await manager.readHistory('macbook', project, sessions[0].id);
  console.log('history messages:', history.length, history.slice(-2));
}

const { id } = manager.createSession('macbook', project);
console.log('new session', id);
const receipt = await manager.prompt('macbook', project, id, '只回复两个字：pong。不要使用任何工具。');
console.log('prompt accepted', receipt);

const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  const state = manager.sessionState('macbook', project, id);
  if (!state.running && state.messages.some((m) => m.role === 'assistant')) break;
  await new Promise((resolve) => setTimeout(resolve, 800));
}
const state = manager.sessionState('macbook', project, id);
console.log('live messages:', state.messages.map((m) => [m.role, m.text.slice(0, 60)]));

const persisted = await manager.readHistory('macbook', project, id);
console.log('persisted messages:', persisted.length, persisted.map((m) => [m.role, m.text.slice(0, 40)]));

manager.dispose();
console.log('OK', Date.now() - t0, 'ms');
process.exit(0);
