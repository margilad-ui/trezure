import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [w, h, scheme] of [[390, 844, 'light'], [1280, 900, 'light'], [390, 844, 'dark']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: scheme })
  const p = await ctx.newPage()
  await p.goto('http://localhost:4173/trezure/dev/ui', { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  const el = await p.$('#s3')
  await el.screenshot({ path: `/tmp/s3-${w}-${scheme}.png` })
}
await b.close()
