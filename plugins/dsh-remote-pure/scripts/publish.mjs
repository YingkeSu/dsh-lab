/**
 * Non-interactive npm publish for this package.
 *
 * npm 2FA blocks plain publishes. A granular access token with "Bypass 2FA" and
 * publish permission lifts that gate. The token is read from (first match):
 *   1. $NPM_TOKEN
 *   2. macOS Keychain:  security find-generic-password -a npm-publish -s dsh-remote-pure -w
 *   3. ~/.npmrc-automation
 * The token is merged into a throwaway userconfig next to the existing proxy
 * settings, so the interactive ~/.npmrc login is never touched.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function readToken() {
  if (process.env.NPM_TOKEN) return process.env.NPM_TOKEN.trim();
  try {
    return execFileSync('security', ['find-generic-password', '-a', 'npm-publish', '-s', pkg.name, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // fall through
  }
  try {
    const line = readFileSync(join(homedir(), '.npmrc-automation'), 'utf8')
      .split('\n')
      .find((row) => row.includes('_authToken'));
    if (line) return line.split('=').slice(1).join('=').trim();
  } catch {
    // fall through
  }
  throw new Error(
    'no npm token: create a granular token with "Bypass 2FA" + "Read and write (publish and stage)", then store it with\n' +
    '  security add-generic-password -a npm-publish -s ' + pkg.name + ' -w "<TOKEN>" -U\n' +
    'or put it in ~/.npmrc-automation (mode 600) or $NPM_TOKEN.',
  );
}

function baseNpmrc({ withProxy }) {
  try {
    const existing = readFileSync(join(homedir(), '.npmrc'), 'utf8');
    return existing
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.includes('_authToken'))
      .filter((line) => withProxy || !/^(https?-proxy|proxy|noproxy|no-proxy)\s*=/.test(line.trim()))
      .join('\n');
  } catch {
    return '';
  }
}

let token;
try {
  token = readToken();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), 'dsh-publish-'));
try {
  if (!process.argv.includes('--skip-tests')) {
    console.log('• tests');
    execFileSync(process.execPath, ['--test', 'test/*.test.js'], { cwd: root, stdio: 'inherit' });
  }
  const attempts = [{ withProxy: false, label: 'direct' }];
  if (baseNpmrc({ withProxy: true }) !== baseNpmrc({ withProxy: false })) {
    attempts.push({ withProxy: true, label: '~/.npmrc proxy' });
  }
  let published = false;
  for (const attempt of attempts) {
    const npmrc = join(dir, `npmrc-${attempt.label.replace(/\W+/g, '-')}`);
    writeFileSync(npmrc, `${baseNpmrc({ withProxy: attempt.withProxy })}\n//registry.npmjs.org/:_authToken=${token}\n`, { mode: 0o600 });
    console.log(`• publishing ${pkg.name}@${pkg.version} (${attempt.label})`);
    try {
      execFileSync('npm', ['publish', '--access', 'public'], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, NPM_CONFIG_USERCONFIG: npmrc, npm_config_userconfig: npmrc },
      });
      published = true;
      break;
    } catch {
      console.error(`✗ publish attempt failed (${attempt.label})`);
    }
  }
  if (!published) throw new Error('all publish attempts failed');
  console.log(`✓ published ${pkg.name}@${pkg.version}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
