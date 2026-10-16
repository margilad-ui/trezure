import { publicUrl } from './supabase'
import { BASE } from './router'
import type { ItemWithImages } from './types'

/** Mixes a hex colour towards white, the canvas stand in for color-mix with the surface. */
function wash(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0x9ca3af
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const mix = (c: number) => Math.round(c * pct + 255 * (1 - pct))
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

function load(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image()
    if (cors) i.crossOrigin = 'anonymous'
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('image_load'))
    i.src = src
  })
}

/**
 * The one place a backdrop is burned into a file: a square PNG for sharing. Category sweep, contact
 * shadow, the cutout at a uniform scale, the item name and the wordmark. Made on demand, never stored.
 */
export async function buildShareImage(item: ItemWithImages, color: string, size = 1200): Promise<Blob> {
  const imgs = (item.item_images ?? []).slice().sort((a, b) => a.sort - b.sort)
  const pick = imgs.find(i => i.id === item.cover_image_id) ?? imgs[0]
  if (!pick) throw new Error('no_image')
  const src = publicUrl('images', pick.path_clean || pick.path_original)
  const photo = await load(src, true)

  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const x = c.getContext('2d')!
  const g = x.createLinearGradient(0, 0, 0, size)
  g.addColorStop(0, wash(color, 0.11)); g.addColorStop(1, wash(color, 0.28))
  x.fillStyle = g; x.fillRect(0, 0, size, size)

  // the item, contained with the same padding the app uses
  const cut = Boolean(pick.path_clean)
  const pad = size * 0.11
  const box = size - pad * 2 - size * 0.08
  const scale = cut ? Math.min(box / photo.width, box / photo.height) : Math.max(box / photo.width, box / photo.height)
  const w = photo.width * scale, h = photo.height * scale
  const dx = (size - w) / 2, dy = pad + (box - h) / 2

  // contact shadow, sitting on the item's own base rather than at a fixed height
  if (cut) {
    x.save()
    x.filter = `blur(${Math.round(size * 0.012)}px)`
    x.fillStyle = 'rgba(15,30,45,.22)'
    x.beginPath()
    x.ellipse(size / 2, dy + h - h * 0.015, Math.min(w * 0.42, size * 0.3), size * 0.022, 0, 0, Math.PI * 2)
    x.fill()
    x.restore()
  }
  if (cut) x.drawImage(photo, dx, dy, w, h)
  else {
    x.save()
    const r = size * 0.04
    x.beginPath(); x.roundRect(pad, pad, box, box, r); x.clip()
    x.drawImage(photo, pad + (box - w) / 2, pad + (box - h) / 2, w, h)
    x.restore()
  }

  // name and wordmark
  const name = (item.name || '').trim()
  if (name) {
    x.fillStyle = '#0F1E2D'
    x.textAlign = 'center'
    x.font = `700 ${Math.round(size * 0.052)}px Assistant, sans-serif`
    const max = size * 0.84
    let text = name
    while (x.measureText(text).width > max && text.length > 4) text = text.slice(0, -2)
    if (text !== name) text = text.trimEnd() + '…'
    x.fillText(text, size / 2, size * 0.925)
  }
  try {
    const logo = await load(`${BASE}/logo/trezure-logo-ink.svg`)
    const lw = size * 0.14, lh = lw * (logo.height / logo.width || 0.26)
    x.globalAlpha = 1
    x.drawImage(logo, size - lw - size * 0.045, size * 0.045, lw, lh)
  } catch { /* the picture works without the mark */ }

  return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/png'))
}

/** Hands the picture to the phone's share sheet, or downloads it on a desktop. */
export async function shareImage(blob: Blob, filename: string, title: string): Promise<'shared' | 'saved'> {
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared' } catch { /* cancelled, fall through to save */ }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'saved'
}
