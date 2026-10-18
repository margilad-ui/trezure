import QRCode from 'qrcode'
import { BASE } from './router'

/**
 * Label rendering, direction A as approved in round 2: a black bar with the white wordmark, the name,
 * a full height QR and the code in mono. Drawn straight onto a canvas at the printer's own resolution,
 * so what the NIIMBOT receives is exactly the pixels we designed, with no scaling in between.
 *
 * Everything below is in millimetres and converted once. The house rule holds: nothing under 2.9mm.
 */
export const DPI = 203
export const mm = (v: number) => Math.round((v / 25.4) * DPI)

export type LabelKind = 'item' | 'location'
export type LabelSize = '50x30' | '30x50' | '70x50' | 'r31'

/**
 * Every template the app prints. w x h is the label as you read it; `rotate` says it goes through the
 * printer turned a quarter (its short side lies across the head); `roll` is the roll it needs.
 */
export const SIZES: Record<LabelSize, { w: number; h: number; rotate: boolean; round?: boolean; roll: string }> = {
  '50x30': { w: 50, h: 30, rotate: false, roll: '50×30' },
  '30x50': { w: 30, h: 50, rotate: true, roll: '50×30' },
  '70x50': { w: 70, h: 50, rotate: true, roll: '50×70' },
  'r31': { w: 31, h: 31, rotate: false, round: true, roll: 'עגול 31' },
}
export const SIZES_FOR: Record<LabelKind, LabelSize[]> = {
  location: ['70x50', '50x30', '30x50', 'r31'],
  item: ['50x30', '30x50', 'r31'],
}

export interface LabelData {
  /** what the label is for */
  name: string
  /** the human code printed in mono, e.g. OF.C3.S2.B07 */
  code: string
  /** the full address the QR opens */
  url: string
  /** second line for a location label: where it sits */
  parent?: string
  /** what kind of place, in words, for the bar of the big label: "מגירה", "קופסה" */
  kindLabel?: string
  /** a box label with no name yet gets a line to write on with a marker */
  writeLine?: boolean
}

const FONT_HE = 'Assistant, sans-serif'
const FONT_MONO = '"JetBrains Mono", monospace'

/** Greedy wrap into at most `maxLines` lines at the current font. Returns null when it cannot fit. */
function wrapAt(x: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (x.measureText(t).width <= maxW) { cur = t; continue }
    if (!cur) return null                       // a single word is already too wide
    lines.push(cur); cur = w
    if (lines.length === maxLines) return null  // more words left than lines
  }
  if (cur) lines.push(cur)
  return lines.length <= maxLines ? lines : null
}

const ellipsize = (x: CanvasRenderingContext2D, s: string, maxW: number) => {
  let t = s
  while (t.length > 1 && x.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t === s ? s : t.trimEnd() + '…'
}

async function qrCanvas(url: string, sizePx: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas')
  await QRCode.toCanvas(c, url, { margin: 0, errorCorrectionLevel: 'M', width: sizePx, color: { dark: '#000000ff', light: '#ffffffff' } })
  return c
}

async function wordmark(): Promise<HTMLImageElement | null> {
  try {
    const i = new Image()
    await new Promise((res, rej) => { i.onload = res; i.onerror = rej; i.src = `${BASE}/logo/trezure-logo-white.svg` })
    return i
  } catch { return null }
}


/**
 * Picks the name size and line count that fit the vertical room available, and says whether the
 * secondary line still has somewhere to go. Nothing is drawn over anything else.
 */
function layoutName(
  x: CanvasRenderingContext2D, d: LabelData, maxW: number, room: number,
  startPx: number, minPx: number, parentPx: number, gap = mm(0.6),
): { px: number; lines: string[]; parent?: string } {
  const wantParent = Boolean(d.parent?.trim())
  for (const withParent of wantParent ? [true, false] : [false]) {
    for (let px = startPx; px >= minPx; px -= 1) {
      x.font = `700 ${px}px ${FONT_HE}`
      for (const maxLines of [1, 2]) {
        const fit = wrapAt(x, d.name, maxW, maxLines)
        if (!fit) continue
        // exactly where the drawing puts the last baseline, plus its descender
        const h = withParent
          ? px * (0.82 + fit.length * 1.05) + gap + parentPx * 0.3
          : px * (0.82 + (fit.length - 1) * 1.05) + px * 0.3
        if (h <= room) {
          if (!withParent) return { px, lines: fit }
          x.font = `400 ${parentPx}px ${FONT_HE}`
          return { px, lines: fit, parent: ellipsize(x, d.parent!.trim(), maxW) }
        }
      }
    }
  }
  x.font = `700 ${minPx}px ${FONT_HE}`
  return { px: minPx, lines: [ellipsize(x, d.name, maxW)] }
}

/**
 * Draws one label. 50x30 is landscape (bar, then name and code beside a full height QR);
 * 30x50 is portrait (bar, name, QR, code), both straight from the approved round 2 geometry.
 */
export async function drawLabel(kind: LabelKind, size: LabelSize, d: LabelData): Promise<HTMLCanvasElement> {
  if (size === '70x50') return drawBig(d)
  if (size === 'r31') return drawRound(kind, d)
  const land = size === '50x30'
  const W = mm(land ? 50 : 30), H = mm(land ? 30 : 50)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const x = c.getContext('2d')!
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H)
  x.textBaseline = 'alphabetic'
  x.direction = 'rtl'

  // the black bar with the wordmark
  const barH = mm(7)
  x.fillStyle = '#000'; x.fillRect(0, 0, W, barH)
  const mark = await wordmark()
  if (mark) {
    const h = mm(land ? 4.6 : 4.4)
    const w = h * ((mark.naturalWidth || 420) / (mark.naturalHeight || 110))
    x.drawImage(mark, (W - w) / 2, (barH - h) / 2, w, h)
  }

  const padX = mm(2)
  x.fillStyle = '#000'
  const codeFont = `700 ${mm(land ? 3.4 : 3)}px ${FONT_MONO}`

  if (land) {
    const qrSize = mm(19.4)
    const qr = await qrCanvas(d.url, qrSize)
    const qrX = mm(1.6), qrY = barH + (H - barH - qrSize) / 2
    x.drawImage(qr, qrX, qrY, qrSize, qrSize)

    const textRight = W - padX
    const textW = textRight - (qrX + qrSize + mm(2))
    const top = barH + mm(1.6)
    const codeBase = H - mm(1.6)
    // everything above the code line, with a little air
    const room = codeBase - mm(3.4) - mm(0.8) - top

    const block = layoutName(x, d, textW, room, mm(5.6), mm(3.2), mm(3))
    x.textAlign = 'right'
    x.font = `700 ${block.px}px ${FONT_HE}`
    block.lines.forEach((ln, i) => x.fillText(ln, textRight, top + block.px * (0.82 + i * 1.05)))
    if (block.parent) {
      x.font = `400 ${mm(3)}px ${FONT_HE}`
      x.fillText(block.parent, textRight, top + block.px * (0.82 + block.lines.length * 1.05) + mm(0.6))
    }

    x.font = codeFont
    x.direction = 'ltr'; x.textAlign = 'right'
    x.fillText(d.code, textRight, codeBase)
    x.direction = 'rtl'
  } else {
    const top = barH + mm(1.8)
    const textW = W - padX * 2
    const codeBase = H - mm(1.8)
    const codeTop = codeBase - mm(3)
    // the name takes what it needs, the QR takes what is left, never less than 14mm
    const block = layoutName(x, d, textW, mm(16), mm(5.4), mm(3), mm(2.9))
    x.textAlign = 'right'
    x.font = `700 ${block.px}px ${FONT_HE}`
    block.lines.forEach((ln, i) => x.fillText(ln, W - padX, top + block.px * (0.82 + i * 1.05)))
    let nameBottom = top + block.px * (0.82 + (block.lines.length - 1) * 1.05) + block.px * 0.3
    if (block.parent) {
      x.font = `400 ${mm(2.9)}px ${FONT_HE}`
      nameBottom += mm(0.6) + mm(2.9)
      x.fillText(block.parent, W - padX, nameBottom)
    }

    const gap = mm(1.6)
    const qrSize = Math.max(mm(13), Math.min(mm(20), textW, codeTop - gap - (nameBottom + gap)))
    const qr = await qrCanvas(d.url, qrSize)
    const qrTop = nameBottom + gap + Math.max(0, (codeTop - gap - (nameBottom + gap) - qrSize) / 2)
    x.drawImage(qr, (W - qrSize) / 2, qrTop, qrSize, qrSize)

    x.font = codeFont
    x.direction = 'ltr'; x.textAlign = 'center'
    x.fillText(d.code, W / 2, codeBase)
  }
  return c
}

function blank(W: number, H: number) {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const x = c.getContext('2d')!
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H)
  x.textBaseline = 'alphabetic'
  return { c, x }
}

/** Largest font (between max and min px) at which `text` fits `maxW`, in the given family and weight. */
function fitPx(x: CanvasRenderingContext2D, text: string, maxW: number, maxPx: number, minPx: number, font: (px: number) => string): number {
  for (let px = maxPx; px > minPx; px -= 1) { x.font = font(px); if (x.measureText(text).width <= maxW) return px }
  x.font = font(minPx); return minPx
}

/**
 * 70x50, for places: drawers, shelves, cabinets and boxes. Read from across the room. A black bar with the
 * wordmark and the kind of place, a big QR on the left, and on the right the code in large mono, the name,
 * and where it sits (left out for boxes, which move). A box without a name gets a line to write on.
 */
async function drawBig(d: LabelData): Promise<HTMLCanvasElement> {
  const W = mm(70), H = mm(50)
  const { c, x } = blank(W, H)
  const barH = mm(8), pad = mm(2.4)
  x.fillStyle = '#000'; x.fillRect(0, 0, W, barH)
  const mark = await wordmark()
  if (mark) {
    const h = mm(5)
    const w = h * ((mark.naturalWidth || 420) / (mark.naturalHeight || 110))
    x.drawImage(mark, pad, (barH - h) / 2, w, h)
  }
  if (d.kindLabel) {
    x.fillStyle = '#fff'; x.direction = 'rtl'; x.textAlign = 'right'
    x.font = `700 ${mm(4.4)}px ${FONT_HE}`
    x.fillText(d.kindLabel, W - pad, barH / 2 + mm(1.6))
  }
  x.fillStyle = '#000'

  const qrSize = mm(30)
  const qrY = barH + (H - barH - qrSize) / 2
  x.drawImage(await qrCanvas(d.url, qrSize), pad, qrY, qrSize, qrSize)

  const right = W - pad
  const textW = right - (pad + qrSize + mm(3))
  const top = barH + mm(2.2)
  // the code, as large as the column allows
  x.direction = 'ltr'; x.textAlign = 'right'
  const codePx = fitPx(x, d.code, textW, mm(8.5), mm(4.2), px => `700 ${px}px ${FONT_MONO}`)
  const codeBase = top + codePx * 0.8
  x.fillText(d.code, right, codeBase)
  x.direction = 'rtl'

  const nameTop = codeBase + mm(2.4)
  const bottom = H - mm(2.2)
  const name = d.name?.trim()
  if (name) {
    const room = bottom - nameTop
    const block = layoutName(x, { ...d, name }, textW, room, mm(6.4), mm(3.4), mm(3.4))
    x.textAlign = 'right'
    x.font = `700 ${block.px}px ${FONT_HE}`
    block.lines.forEach((ln, i) => x.fillText(ln, right, nameTop + block.px * (0.82 + i * 1.05)))
    if (block.parent) {
      x.font = `400 ${mm(3.4)}px ${FONT_HE}`
      x.fillText(block.parent, right, nameTop + block.px * (0.82 + block.lines.length * 1.05) + mm(0.8))
    }
  } else if (d.writeLine) {
    // two lines to write the contents on, by hand
    x.lineWidth = 3
    for (const y of [bottom - mm(9), bottom - mm(1.5)]) { x.beginPath(); x.moveTo(right - textW, y); x.lineTo(right, y); x.stroke() }
  }
  return c
}

/**
 * Round 31mm: the smallest label, for a single thing. Just the QR and a short code, both kept inside the
 * circle with room to spare for a roll that sits a little off centre.
 */
async function drawRound(kind: LabelKind, d: LabelData): Promise<HTMLCanvasElement> {
  const S = mm(31)
  const { c, x } = blank(S, S)
  const r = S / 2
  const qrSize = mm(16.5)
  const qrX = (S - qrSize) / 2, qrY = mm(5.2)
  x.drawImage(await qrCanvas(d.url, qrSize), qrX, qrY, qrSize, qrSize)
  // short code: for an item its own 4 letters, for a place its code
  const code = kind === 'item' ? (d.code.split('.').pop() || d.code) : d.code
  const base = qrY + qrSize + mm(4.2)
  const half = Math.sqrt(r * r - (base - r) * (base - r)) - mm(1.2)
  x.fillStyle = '#000'; x.direction = 'ltr'; x.textAlign = 'center'
  fitPx(x, code, half * 2, mm(3.6), mm(2.9), px => `700 ${px}px ${FONT_MONO}`)
  x.fillText(code, r, base)
  return c
}

export function labelUrl(kind: LabelKind, idOrCode: string): string {
  const base = `${location.origin}${BASE}`
  return kind === 'item' ? `${base}/item/${idOrCode}` : `${base}/l/${idOrCode}`
}

export async function labelBlob(kind: LabelKind, size: LabelSize, d: LabelData): Promise<Blob> {
  const c = await drawLabel(kind, size, d)
  return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/png'))
}
