// Renders /dev/ui in both themes at phone and desktop width. Usage: CHROME=<path> node scripts/dev/dark.mjs <outdir>
import { chromium } from 'playwright'
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const out = process.argv[2] || 'shots'
const b = await chromium.launch({ executablePath: exe })
const errs = []
for (const scheme of ['dark', 'light']) {
  for (const [w, tag] of [[1280, 'desktop'], [390, 'phone']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 1200 }, deviceScaleFactor: 1.5, colorScheme: scheme })
    const p = await ctx.newPage()
    p.on('pageerror', e => errs.push(String(e)))
    await p.goto('http://localhost:4173/trezure/dev/ui', { waitUntil: 'networkidle' })
    await p.waitForTimeout(1200)
    await p.screenshot({ path: `${out}/ui-${scheme}-${tag}.png`, fullPage: tag === 'desktop' })
    await ctx.close()
  }
}
console.log('errors:', errs)
await b.close()
