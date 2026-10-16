// Screenshots of every OKI state from /dev/ui, at phone and desktop width. Usage: CHROME=<path> node scripts/dev/oki.mjs <outdir>
import { chromium } from 'playwright'
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const out = process.argv[2] || 'shots'
const b = await chromium.launch({ executablePath: exe })
const errs = []
for (const [w, tag] of [[1280, 'desktop'], [390, 'phone']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  p.on('pageerror', e => errs.push(String(e)))
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await p.goto('http://localhost:4173/trezure/dev/ui', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  for (const id of ['oki-hello', 'oki-x', 'oki-p', 'oki-small']) {
    const el = await p.$('#' + id); if (el) await el.screenshot({ path: `${out}/${id}-${tag}.png` })
  }
  await ctx.close()
}
console.log('errors:', errs)
await b.close()
