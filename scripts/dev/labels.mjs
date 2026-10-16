// Screenshots the label demo from /dev/ui at print resolution. Usage: CHROME=<path> node scripts/dev/labels.mjs <outdir>
import { chromium } from 'playwright'
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const out = process.argv[2] || 'shots'
const b = await chromium.launch({ executablePath: exe })
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 203 / 96 })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(String(e)))
await p.goto('http://localhost:4173/trezure/dev/ui', { waitUntil: 'networkidle' })
await p.waitForTimeout(2000)
const el = await p.$('#label-demo')
if (el) await el.screenshot({ path: `${out}/labels.png` })
console.log('errors:', errs, 'found:', Boolean(el))
await b.close()
