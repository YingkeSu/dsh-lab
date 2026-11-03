/** The shipped patch names the code it changes, and the apply script refuses a target that is not dsh-superagent. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const patch = readFileSync(join(root, 'ok-receipt.patch'), 'utf8')
const apply = join(root, 'scripts', 'apply.mjs')

test('the patch covers the intake decision, the outbox effect, the Feishu reaction and its tests', () => {
  for (const file of ['src/core/intake.ts', 'src/core/ports.ts', 'src/app/outbox.ts', 'src/app/effects.ts',
    'src/sources/feishu-channel.ts', 'src/sources/kind.ts', 'tests/feishu-receipt.spec.ts', 'tests/outbox.spec.ts']) {
    assert.ok(patch.includes(`diff --git a/${file} b/${file}`), `patch changes ${file}`)
  }
  assert.match(patch, /RECEIPT_EMOJI = 'OK'/)
  assert.match(patch, /RECEIPT_WINDOW_MS = 5 \* 60 \* 1000/)
})

test('apply.mjs refuses a target that is not dsh-superagent', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ok-receipt-'))
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'something-else' }))
  const result = spawnSync(process.execPath, [apply, directory], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /is not dsh-superagent/)
})

test('apply.mjs refuses to run without a target', () => {
  const result = spawnSync(process.execPath, [apply], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /usage:/)
})
