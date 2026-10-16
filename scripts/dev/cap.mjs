import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [w,h,name] of [[390,844,'cap-390'],[360,740,'cap-360']]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:2 })
  const p = await ctx.newPage()
  await p.goto('file://' + process.argv[2] + '/cap.html')
  await p.waitForTimeout(700)
  const over = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  console.log(name, 'overflow px:', over)
  await p.screenshot({ path: process.argv[3] + '/' + name + '.png' })
}
await b.close()
