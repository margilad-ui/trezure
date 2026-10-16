// Builds PWA icons. Source: public/icons/appicon-source.png (OKI face, white on teal) when present,
// otherwise the vector OKI silhouette on teal. Also resizes the OKI master to the sizes the app uses.
import sharp from 'sharp'
import { existsSync, mkdirSync } from 'node:fs'

mkdirSync('public/icons', { recursive: true })
const TEAL = '#0F7B8A'

const silhouette = (pad) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" fill="${TEAL}"/>
<g transform="translate(${pad} ${pad}) scale(${(100 - 2 * pad) / 100})">
<ellipse cx="50" cy="40" rx="34" ry="32" fill="#fff"/>
<path d="M28 62 C 20 74, 6 74, 10 88 C 12 94, 20 94, 22 88 M41 68 C 37 80, 30 86, 34 96 M59 68 C 63 80, 70 86, 66 96 M72 62 C 80 74, 94 74, 90 88 C 88 94, 80 94, 78 88" stroke="#fff" stroke-width="12" stroke-linecap="round" fill="none"/>
<circle cx="37" cy="40" r="7.5" fill="${TEAL}"/><circle cx="63" cy="40" r="7.5" fill="${TEAL}"/>
<path d="M43 54 q7 6 14 0" stroke="${TEAL}" stroke-width="3.4" stroke-linecap="round" fill="none"/>
</g></svg>`)

const src = existsSync('public/icons/appicon-source.png') ? 'public/icons/appicon-source.png' : null
console.log('icon source:', src ?? 'vector silhouette')

async function out(size, name, maskable = false) {
  let img
  if (src) {
    img = sharp(src).resize(size, size, { fit: 'cover' })
    if (maskable) {
      // keep the mark inside the 80% safe zone
      const inner = Math.round(size * 0.8)
      const mark = await sharp(src).resize(inner, inner, { fit: 'cover' }).toBuffer()
      img = sharp({ create: { width: size, height: size, channels: 4, background: TEAL } }).composite([{ input: mark, gravity: 'centre' }])
    }
  } else {
    img = sharp(silhouette(maskable ? 18 : 10)).resize(size, size)
  }
  await img.png().toFile(`public/icons/${name}`)
}

await out(192, 'icon-192.png')
await out(512, 'icon-512.png')
await out(512, 'maskable-512.png', true)
await out(32, 'favicon-32.png')
await out(16, 'favicon-16.png')
await out(180, 'apple-180.png')

if (existsSync('public/oki/master.png')) {
  await sharp('public/oki/master.png').resize(480, 480, { fit: 'inside' }).png().toFile('public/oki/master-480.png')
  await sharp('public/oki/master.png').resize(160, 160, { fit: 'inside' }).png().toFile('public/oki/master-160.png')
  console.log('oki master resized')
}
console.log('icons done')
