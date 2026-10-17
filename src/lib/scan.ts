/**
 * Reading codes: the phone's own BarcodeDetector when it has one (Android Chrome does), and the ZXing
 * port in WebAssembly everywhere else. The WASM file ships with the app, so no third party is involved.
 */
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

export type ScanHit =
  | { kind: 'location'; code: string; raw: string }
  | { kind: 'item'; id: string; raw: string }
  | { kind: 'barcode'; digits: string; raw: string }
  | { kind: 'other'; raw: string }

export interface Found { rawValue: string; format: string; boundingBox?: DOMRectReadOnly }
interface Detector { detect(src: CanvasImageSource | Blob | ImageData): Promise<Found[]> }

const WANTED = ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'data_matrix']
const PRODUCT = WANTED.filter(f => f !== 'qr_code' && f !== 'data_matrix')

type DetectorCtor = { new (o?: { formats?: string[] }): Detector; getSupportedFormats(): Promise<string[]> }
const nativeCtor = (): DetectorCtor | null => (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null

let nativeP: Promise<Detector | null> | null = null
/** The built in detector, or null. Cheap, so capture can use it on every frame without loading anything. */
export function nativeDetector(): Promise<Detector | null> {
  if (!nativeP) nativeP = (async () => {
    const C = nativeCtor(); if (!C) return null
    try {
      const have = await C.getSupportedFormats()
      const formats = WANTED.filter(f => have.includes(f))
      if (!formats.includes('qr_code')) return null
      return new C({ formats })
    } catch { return null }
  })()
  return nativeP
}

let anyP: Promise<Detector> | null = null
/** A detector that always works: native first, otherwise ZXing loaded on demand. */
export function detector(): Promise<Detector> {
  if (!anyP) anyP = (async () => {
    const n = await nativeDetector()
    if (n) return n
    const mod = await import('barcode-detector/ponyfill')
    mod.setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => path.endsWith('.wasm') ? wasmUrl : prefix + path })
    return new mod.BarcodeDetector({ formats: WANTED as never }) as unknown as Detector
  })()
  return anyP
}

/** What a scanned value means in TREZURE: a place label, an item label, a product barcode, or nothing of ours. */
export function classify(raw: string): ScanHit {
  const v = raw.trim()
  const loc = v.match(/\/l\/([^/?#\s]+)/)
  if (loc && /trezure|^\/l\//i.test(v)) return { kind: 'location', code: decodeURIComponent(loc[1]), raw: v }
  const item = v.match(/\/item\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  if (item) return { kind: 'item', id: item[1].toLowerCase(), raw: v }
  const digits = v.replace(/[\s-]/g, '')
  if (/^\d{6,14}$/.test(digits)) return { kind: 'barcode', digits, raw: v }
  return { kind: 'other', raw: v }
}

/** Product barcode in a still frame, using only the built in detector (never blocks capture on a download). */
export async function productBarcode(src: CanvasImageSource): Promise<string | null> {
  const d = await nativeDetector()
  if (!d) return null
  try {
    const found = await d.detect(src)
    for (const f of found) if (PRODUCT.includes(f.format)) { const h = classify(f.rawValue); if (h.kind === 'barcode') return h.digits }
  } catch { /* ignore */ }
  return null
}

/** Barcodes are compared by digits only; a leading zero (UPC inside EAN) does not make two codes different. */
export function sameBarcode(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const n = (x: string) => x.replace(/\D/g, '').replace(/^0+/, '')
  return n(a) !== '' && n(a) === n(b)
}
