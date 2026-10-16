// Downloads brand PNGs from Supabase Storage (public bucket "brand") into public/.
// Tolerant: a failed download is logged and skipped, the build continues with the vector fallbacks.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'

const BASE = 'https://tkacgqckejabgnlzdujx.supabase.co/storage/v1/object/public/brand'
const FILES = [
  ['oki/oki-master-clean.png', 'public/oki/master.png'],
  ['oki/oki-silhouette-clean.png', 'public/oki/silhouette.png'],
  ['oki/oki-poses-clean.png', 'public/oki/poses.png'],
  ['oki/oki-expressions-clean.png', 'public/oki/expressions.png'],
  ['icons/appicon-final-clean.png', 'public/icons/appicon-source.png'],
]

mkdirSync('public/oki', { recursive: true })
mkdirSync('public/icons', { recursive: true })

for (const [src, dst] of FILES) {
  if (existsSync(dst) && !process.env.FORCE_BRAND) { console.log('keep', dst); continue }
  try {
    const r = await fetch(`${BASE}/${src}`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    writeFileSync(dst, Buffer.from(await r.arrayBuffer()))
    console.log('ok  ', dst)
  } catch (e) {
    console.log('skip', dst, String(e.message || e))
  }
}
