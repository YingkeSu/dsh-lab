#!/usr/bin/env node
/**
 * Apply the OK-receipt patch to a dsh-superagent checkout, and optionally build it.
 *
 * Usage: node scripts/apply.mjs <path-to-dsh-superagent> [--build]
 *
 * The patch is a source change to dsh-superagent, not a DSH bundle, so it cannot be installed with `dsh plugin add`.
 * Refuses a checkout that is not dsh-superagent, a dirty git worktree, and an already-applied patch. `--build` runs
 * `pnpm install --frozen-lockfile` and `pnpm build` after applying.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const patch = join(root, 'ok-receipt.patch')
const args = process.argv.slice(2)
const build = args.includes('--build')
const target = args.find(value => !value.startsWith('-'))

const fail = message => { console.error('dsh-superagent-ok-receipt: ' + message); process.exit(1) }
const git = (cwd, argv) => execFileSync('git', ['-C', cwd, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

if (!target) fail('usage: node scripts/apply.mjs <path-to-dsh-superagent> [--build]')
const checkout = resolve(target)
if (!existsSync(join(checkout, 'package.json'))) fail(`${checkout} has no package.json; give a dsh-superagent checkout`)

const manifest = JSON.parse(readFileSync(join(checkout, 'package.json'), 'utf8'))
if (manifest.name !== 'dsh-superagent') fail(`${checkout} is not dsh-superagent (package name ${JSON.stringify(manifest.name)})`)

// A git checkout must be clean so the patch is the only change and `git checkout -- .` can roll it back.
let tracked = false
try {
  tracked = git(checkout, ['rev-parse', '--is-inside-work-tree']).trim() === 'true'
} catch { tracked = false }
if (tracked) {
  const dirty = git(checkout, ['status', '--porcelain', '--', '.']).trim()
  if (dirty) fail('the checkout has uncommitted changes; commit or stash them first:\n' + dirty)
}

try {
  git(checkout, ['apply', '--check', patch])
} catch (error) {
  // A patch that only reverses cleanly is already applied; anything else is a version mismatch.
  try {
    git(checkout, ['apply', '--reverse', '--check', patch])
    fail('the patch is already applied to ' + checkout)
  } catch {
    fail(`the patch does not apply to ${checkout}; it targets dsh-superagent 0.1.0 (commit 6337fc8)\n` + String(error.stderr ?? error))
  }
}

git(checkout, ['apply', '--whitespace=nowarn', patch])
console.log(`Applied ok-receipt.patch to ${checkout}`)

if (build) {
  execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd: checkout, stdio: 'inherit' })
  execFileSync('pnpm', ['build'], { cwd: checkout, stdio: 'inherit' })
  console.log('Built dsh-superagent')
}

console.log(`
Next:
  1. Restart the DSH profile that loads dsh-superagent, for example:
       ${join(checkout, 'scripts', 'dsh-superagent')} restart
  2. Send the bot a direct message from a person the Policy admits; an OK reaction appears under it.
  3. Roll back with: cd ${checkout} && git checkout -- . && rm tests/feishu-receipt.spec.ts && pnpm build`)
