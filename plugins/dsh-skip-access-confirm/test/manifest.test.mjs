import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (name) => readFileSync(join(root, name), 'utf8')
const manifest = JSON.parse(read('package.json'))

test('manifest declares an installable web bundle', () => {
  assert.equal(manifest.name, 'dsh-skip-access-confirm')
  assert.equal(manifest.private, undefined, 'a published plugin must not be private')
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh?.client?.platform, 'web')
  assert.equal(typeof manifest.exports?.['./client'], 'string')
  assert.match(manifest.engines?.dsh ?? '', /^\S+.*<0\.3\.0/)
})

test('runtime entries exist and are covered by the published file list', () => {
  const files = [
    manifest.dsh.bundle.patch,
    manifest.exports['./client'],
    manifest.exports['.'],
    manifest.exports['./icon'],
    'README.md',
    'LICENSE',
  ]
  for (const file of files) assert.equal(existsSync(join(root, file)), true, file)

  const published = manifest.files.flatMap((entry) => {
    if (!entry.includes('*')) return [entry]
    // locale/*.json
    return ['locale/en.json', 'locale/zh.json']
  })
  for (const file of ['index.js', 'client.js', 'README.md', 'LICENSE', 'cordis.patch.yml', 'icon.svg']) {
    assert.equal(published.includes(file), true, `${file} must be published`)
  }
})

test('client bundle registers itself under the package name', () => {
  const client = read('client.js')
  assert.match(client, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(client, new RegExp(`id: '${manifest.name}'`))
  assert.match(client, /exports\.apply = apply/)
})

test('bundle patch inserts one row for this package', () => {
  const patch = read('cordis.patch.yml')
  assert.match(patch, /- insert:/)
  assert.match(patch, new RegExp(`name: '${manifest.name}'`))
})

test('display metadata is complete for the plugin market', () => {
  assert.ok(manifest.icon, 'package.json icon is required for market cards')
  assert.match(read(manifest.icon), /^<svg[\s>]/)
  for (const language of ['en', 'zh']) {
    const locale = JSON.parse(read(`locale/${language}.json`))
    assert.equal(typeof locale.meta?.title, 'string', `${language} meta.title`)
    assert.equal(typeof locale.meta?.description, 'string', `${language} meta.description`)
  }
  assert.ok(manifest.author)
  assert.ok(manifest.homepage.startsWith('https://'))
  assert.ok(manifest.repository?.url)
  assert.equal(manifest.repository.directory, 'plugins/dsh-skip-access-confirm')
})
