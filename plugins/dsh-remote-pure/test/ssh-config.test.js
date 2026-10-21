import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSshConfig, mergeHosts } from '../lib/ssh-config.js';

const SAMPLE = `Host macbook
  HostName 100.103.213.39
  User suyingke
  IdentityFile ~/.ssh/id_ed25519

Host wry tencent
  User syk
  Port 2222

Host *
  ServerAliveInterval 15

Host *.internal
  User ignored
`;

test('parseSshConfig lists concrete aliases with their options and skips wildcards', () => {
  const hosts = parseSshConfig(SAMPLE);
  assert.deepEqual(hosts.map((host) => host.alias), ['macbook', 'wry', 'tencent']);
  assert.equal(hosts[0].hostName, '100.103.213.39');
  assert.equal(hosts[0].user, 'suyingke');
  assert.equal(hosts[1].port, 2222);
});

test('mergeHosts keeps configured rows first and adds discovered aliases once', () => {
  const merged = mergeHosts({
    configured: [{ id: 'macbook', ssh: 'macbook', label: 'MacBook', dshCommand: 'node dsh.js' }],
    discovered: parseSshConfig(SAMPLE),
    defaults: { dshCommand: 'dsh', dshHome: '$HOME/.dsh', provider: 'deepseek-official', model: 'deepseek-flash' },
  });
  assert.deepEqual(merged.map((row) => row.id), ['macbook', 'tencent', 'wry']);
  assert.equal(merged[0].dshCommand, 'node dsh.js');
  assert.equal(merged[1].dshCommand, 'dsh');
  assert.equal(merged[1].label, 'tencent');
  assert.equal(merged[2].id, 'wry');
});

test('mergeHosts can hide aliases from discovery', () => {
  const merged = mergeHosts({
    configured: [],
    discovered: parseSshConfig(SAMPLE),
    defaults: { dshCommand: 'dsh' },
    ignore: ['wry', 'tencent'],
  });
  assert.deepEqual(merged.map((row) => row.id), ['macbook']);
});
