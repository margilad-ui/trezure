import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await b.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1.5 })).newPage()
await p.goto('http://localhost:4173/trezure/dev/ui', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
await (await p.$('#label-demo')).screenshot({ path: process.argv[2] || '/tmp/labels.png' })
await b.close()
