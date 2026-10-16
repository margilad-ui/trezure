import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const out = process.argv[2]
const errs = []
for (const [mode, name] of [['code','login-code'],['password','login-pw']]) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 })
  await ctx.addInitScript(m => { try { localStorage.setItem('tz.login.mode', m) } catch {} }, mode)
  const p = await ctx.newPage()
  p.on('pageerror', e => errs.push(name + ': ' + e))
  p.on('console', m => { if (m.type()==='error') errs.push(name + ': ' + m.text()) })
  await p.goto('http://localhost:4173/trezure/', { waitUntil:'networkidle' })
  await p.waitForTimeout(1000)
  const over = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  console.log(name, 'overflow', over)
  await p.screenshot({ path: out + '/' + name + '.png' })
}
console.log('errors:', errs)
await b.close()
