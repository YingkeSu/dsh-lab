import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfiles, parseProfileListing, isLaunchableProfile } from '../lib/profiles.js';

const encode = (value) => Buffer.from(value).toString('base64');
const manifest = (bundles) => JSON.stringify({ name: 'dsh-profile-x', dsh: { profile: { bundles } } });
const row = (name, body) => `${name}\t${encode(body)}`;

function fixture({ host = { id: 'mb', ssh: 'macbook' }, output = '', error } = {}) {
  const calls = [];
  const profiles = createProfiles({
    hosts: [host],
    runRemote: async (args, options) => {
      calls.push({ args, options });
      if (error !== undefined) throw error;
      return output;
    },
  });
  return { profiles, calls };
}

test('launchable profiles exclude the GUI-only desktop profile and invalid names', () => {
  assert.equal(isLaunchableProfile('web'), true);
  assert.equal(isLaunchableProfile('sdk-2'), true);
  assert.equal(isLaunchableProfile('desktop'), false);
  assert.equal(isLaunchableProfile('Desktop'), false);
  assert.equal(isLaunchableProfile('bad name'), false);
  assert.equal(isLaunchableProfile('-leading'), false);
  assert.equal(isLaunchableProfile('a'.repeat(65)), false);
  assert.equal(isLaunchableProfile(undefined), false);
});

test('list parses bundles, skips desktop/node_modules and keeps unparseable manifests', async () => {
  const longName = 'a'.repeat(65);
  const output = [
    row('web', manifest(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])),
    row('sdk', manifest(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-sdk-app'])),
    row('plain', JSON.stringify({ bundles: ['@deepseek-ai/dsh-web-app'] })),
    row('custom', manifest(['@deepseek-ai/dsh-base'])),
    row('broken', 'not json at all'),
    row('desktop', manifest(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])),
    row('node_modules', manifest(['@deepseek-ai/dsh-web-app'])),
    row('bad name', manifest(['@deepseek-ai/dsh-web-app'])),
    row(longName, manifest(['@deepseek-ai/dsh-web-app'])),
  ].join('\n');
  const { profiles, calls } = fixture({ output, host: { id: 'mb', ssh: 'macbook', webProfile: 'sdk' } });
  const result = await profiles.list('mb');
  assert.deepEqual(result, {
    hostId: 'mb',
    profiles: [
      { name: 'broken', web: false, sdk: false },
      { name: 'custom', web: false, sdk: false },
      { name: 'plain', web: true, sdk: false },
      { name: 'sdk', web: false, sdk: true },
      { name: 'web', web: true, sdk: false },
    ],
    defaultProfile: 'sdk',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.timeout, 20000);
  const script = calls[0].args.command;
  // One POSIX sh round trip, no node runtime on the remote host.
  assert.match(script, /base64/);
  assert.match(script, /\[ ! -d "\$dir" \]/);
  assert.equal(/\bnode\b/.test(script), false);
});

test('the default dshHome expands $HOME and a configured dshHome is quoted', async () => {
  const { profiles, calls } = fixture({ output: '' });
  await profiles.list('mb');
  assert.match(calls[0].args.command, /dir="\$HOME"'\/\.dsh\/profiles'/);
  calls.length = 0;

  const custom = fixture({ output: '', host: { id: 'mb', ssh: 'macbook', dshHome: '/opt/dsh' } });
  await custom.profiles.list('mb');
  assert.match(custom.calls[0].args.command, /dir='\/opt\/dsh\/profiles';/);
});

test('a missing profiles directory yields an empty list and a Chinese warning', async () => {
  const { profiles } = fixture({ output: '__DSH_REMOTE_PURE_NO_PROFILES__\n' });
  const result = await profiles.list('mb');
  assert.equal(result.hostId, 'mb');
  assert.deepEqual(result.profiles, []);
  assert.equal(result.defaultProfile, 'web');
  assert.match(result.warning, /没有 dsh profile 目录/);
});

test('an SSH failure yields an empty list, a warning and the host default profile', async () => {
  const error = new Error('ssh: connect to host macbook port 22: Connection refused');
  const { profiles } = fixture({ error, host: { id: 'mb', ssh: 'macbook', webProfile: 'sdk' } });
  const result = await profiles.list('mb');
  assert.deepEqual(result.profiles, []);
  assert.equal(result.defaultProfile, 'sdk');
  assert.match(result.warning, /无法读取远端 dsh profile（mb）/);
  assert.match(result.warning, /Connection refused/);
});

test('a missing defaultProfile setting falls back to web', async () => {
  const { profiles } = fixture({ output: '' });
  assert.equal((await profiles.list('mb')).defaultProfile, 'web');
});

test('unknown hosts are rejected by the lister', async () => {
  const { profiles } = fixture({ output: '' });
  await assert.rejects(profiles.list('nope'), /unknown remote host: nope/);
});

test('parseProfileListing tolerates CRLF output and manifest-less rows', () => {
  const parsed = parseProfileListing(`web\t${encode(manifest(['@deepseek-ai/dsh-web-app']))}\r\nbare\n`);
  assert.deepEqual(parsed, { profiles: [{ name: 'bare', web: false, sdk: false }, { name: 'web', web: true, sdk: false }], missing: false });
});
