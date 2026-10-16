import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const out = process.argv[2]
for (const [w, sel, name] of [[360, '.card-item', 'card-360'], [360, '.results', 'res-360'], [768, '.card-item', 'card-768'], [1280, '.card-item', 'card-1280']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  await p.goto('http://localhost:4173/trezure/dev/ui', { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  await p.locator(sel).first().screenshot({ path: `${out}/${name}.png` })
}
await b.close()
console.log('clips done')
