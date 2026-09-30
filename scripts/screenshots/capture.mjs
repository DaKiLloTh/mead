#!/usr/bin/env node
// Captures the four app screenshots mead-site embeds (dashboard, installed,
// search, security), in both light and dark, against a real `wails dev`
// instance.
//
// Why against `wails dev` and not a static mock: `wails.json`'s
// `frontend:dev:serverUrl: "auto"` makes Wails also serve the exact same
// frontend at a plain http:// URL (default http://localhost:34115) while
// `wails dev` is running, wired to the real running Go backend over the same
// websocket-based runtime a packaged app uses -- opening that URL in an
// ordinary browser is, for every purpose that matters here, the real app
// talking to the real (or CI runner's) Homebrew install. This is the same
// technique used to capture the screenshots already in mead-site by hand
// (see issue #109); this script only automates driving the browser.
//
// Usage: node capture.mjs <serverUrl> <outDir>
//   serverUrl  the wails dev bridge, e.g. http://localhost:34115
//   outDir     where to write the 8 PNGs (converted to .webp separately --
//              see screenshots.yml, since Playwright itself can't write webp)

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const [, , serverUrl, outDir] = process.argv
if (!serverUrl || !outDir) {
  console.error('usage: node capture.mjs <serverUrl> <outDir>')
  process.exit(2)
}

const VIEWPORT = { width: 1600, height: 1000 } // matches the existing screenshots in mead-site/assets/screenshots

async function clickNavItem(page, label) {
  // Sidebar items are <a> tags with plain text, not routed URLs (App.tsx
  // keeps the current view in useState) -- clicking by visible text is how a
  // person would navigate, and is what actually exists to click.
  await page.getByRole('listitem').filter({ hasText: label }).locator('a').click()
}

async function shoot(page, path) {
  // A settle beat after any click/scan: signals data as "loaded" (a
  // fetch resolving, a table appearing) rather than the CSS transition on
  // it finishing, and a fixed pause is simpler than chasing every view's
  // own transition duration for a one-off capture script.
  await page.waitForTimeout(400)
  await page.screenshot({ path })
}

async function captureTheme(browser, theme, outDir) {
  const suffix = theme === 'light' ? '-light' : ''
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme })
  const page = await context.newPage()

  await page.goto(serverUrl, { waitUntil: 'networkidle' })
  // Dashboard is the default view on load (App.tsx: useState<ViewKey>('dashboard')).
  // Wait for its real stats, not just the static heading, which is on screen
  // immediately while SystemInfo is still loading.
  await page.getByText('Formulae installed').waitFor({ timeout: 30_000 })
  await shoot(page, `${outDir}/dashboard${suffix}.png`)

  await clickNavItem(page, 'Installed')
  // Row content, not just the empty-table shell, so the screenshot shows real
  // packages rather than a loading state.
  await page.waitForSelector('table tbody tr td', { timeout: 30_000 })
  await shoot(page, `${outDir}/installed${suffix}.png`)

  await clickNavItem(page, 'Search')
  await page.getByPlaceholder(/./).first().fill('wget')
  // Search debounces and dedupes out-of-order responses (see Search.tsx); give
  // it room to settle on a real result rather than an in-flight state.
  await page.waitForSelector('text=/wget/i', { timeout: 30_000 })
  await shoot(page, `${outDir}/search${suffix}.png`)

  await clickNavItem(page, 'Security')
  // Matches the currently published screenshot: the tab before a scan is run
  // (Security's own scan is a real, possibly slow OSV.dev lookup per
  // installed formula, not something worth waiting out here).
  await page.getByText('Scan installed formulae').waitFor({ timeout: 30_000 })
  await shoot(page, `${outDir}/security${suffix}.png`)

  await context.close()
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch()
  try {
    for (const theme of ['dark', 'light']) {
      console.log(`capturing ${theme}...`)
      await captureTheme(browser, theme, outDir)
    }
  } finally {
    await browser.close()
  }
  console.log(`wrote 8 screenshots to ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
