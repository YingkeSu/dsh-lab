// Manual browser check for the client bundle: mounts it in a page with a fake
// `__ModuleLoader__` and verifies the two permission risk dialogs are confirmed
// while an unrelated checkbox dialog is not. Requires Playwright:
//
//   npm install --no-save playwright
//   node test/harness.mjs
//
// PLAYWRIGHT_ANCHOR can point `require` at a package.json from another
// checkout that already has Playwright installed.
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { join } from 'node:path'

const require = createRequire(process.env.PLAYWRIGHT_ANCHOR ?? import.meta.url)
let chromium
try {
  ({ chromium } = require('playwright'))
} catch {
  console.error('playwright is not installed: npm install --no-save playwright')
  process.exit(2)
}

const pluginDir = fileURLToPath(new URL('../', import.meta.url))
const url = pathToFileURL(join(pluginDir, 'test/harness.html')).href

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', error => errors.push(String(error)))
await page.goto(url)
await page.waitForFunction(() => window.__plugin !== undefined)

// 1. Full access risk dialog is auto-confirmed.
await page.evaluate(() => window.openRisk('Enable Full access?'))
await page.waitForTimeout(400)
const full = await page.evaluate(() => ({ confirmed: window.__confirmed, dialogs: document.querySelectorAll('[role="dialog"]').length }))

// 2. Auto review risk dialog is auto-confirmed.
await page.evaluate(() => window.openRisk('Enable Auto review (experimental)?'))
await page.waitForTimeout(400)
const auto = await page.evaluate(() => ({ confirmed: window.__confirmed, dialogs: document.querySelectorAll('[role="dialog"]').length }))

// 3. A dialog that merely has a checkbox is left alone.
await page.evaluate(() => window.openOther('Delete project?'))
await page.waitForTimeout(400)
const other = await page.evaluate(() => ({ confirmed: window.__confirmed, dialogs: document.querySelectorAll('[role="dialog"]').length }))

console.log(JSON.stringify({ full, auto, other, errors }, null, 2))
await browser.close()

const ok = full.confirmed === 1 && full.dialogs === 0
  && auto.confirmed === 2 && auto.dialogs === 0
  && other.confirmed === 2 && other.dialogs === 1
  && errors.length === 0
process.exit(ok ? 0 : 1)
