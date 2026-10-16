// Decodes the QR in every rendered label and prints what a scanner would actually open.
import { chromium } from 'playwright'
import sharp from 'sharp'
import jsQR from 'jsqr'
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage({ viewport: { width: 1400, height: 900 } })
await p.goto('http://localhost:4173/trezure/dev/ui', { waitUntil: 'networkidle' })
await p.waitForTimeout(2000)
const urls = await p.evaluate(() => Array.from(document.querySelectorAll('#label-demo canvas')).map(c => c.toDataURL('image/png')))
for (const [i, d] of urls.entries()) {
  const buf = Buffer.from(d.split(',')[1], 'base64')
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const r = jsQR(new Uint8ClampedArray(data), info.width, info.height)
  console.log(i, info.width + 'x' + info.height, r ? r.data : 'NO QR FOUND')
}
await b.close()
