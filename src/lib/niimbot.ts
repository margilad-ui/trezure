/**
 * Printing straight to a NIIMBOT over Web Bluetooth (Chrome on Android and desktop), through niimbluelib
 * (MIT, an open implementation of the printer's protocol). The library is loaded only when someone prints.
 *
 * Every page sent is a canvas exactly as wide as the print head (384 dots on the B1) with the label drawn in
 * the middle: the B1's paper guide centres the roll, so centred pixels land on the label whatever its width.
 * Pixels are forced to pure black or white first, because the encoder prints any pixel that is not pure white.
 */
import { useSyncExternalStore } from 'react'
import type { NiimbotBluetoothClient as Client } from '@mmote/niimbluelib'

export type PrinterStatus = 'idle' | 'connecting' | 'connected' | 'printing' | 'error'
export interface PrinterState {
  status: PrinterStatus
  name?: string
  model?: string
  /** dots across the head, 384 on the B1 */
  head: number
  progress?: { done: number; total: number }
  error?: string
}
export type Paper = 'white' | 'clear'

let state: PrinterState = { status: 'idle', head: 384 }
const listeners = new Set<() => void>()
const set = (p: Partial<PrinterState>) => { state = { ...state, ...p }; listeners.forEach(f => f()) }
export function usePrinter(): PrinterState {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => state)
}

export const bluetoothSupported = (): boolean => typeof navigator !== 'undefined' && 'bluetooth' in navigator

let client: Client | null = null
let lib: typeof import('@mmote/niimbluelib') | null = null

const LS_DENSITY = 'tz.print.density'
export function getDensity(): number { try { return Number(localStorage.getItem(LS_DENSITY)) || 3 } catch { return 3 } }
export function setDensity(v: number) { try { localStorage.setItem(LS_DENSITY, String(v)) } catch { /* ignore */ } }

/** Opens Chrome's device chooser (must run from a tap) and connects. */
export async function connectPrinter(): Promise<void> {
  if (!bluetoothSupported()) throw new Error('no_bluetooth')
  if (client && state.status === 'connected') return
  set({ status: 'connecting', error: undefined })
  try {
    lib ??= await import('@mmote/niimbluelib')
    const c = new lib.NiimbotBluetoothClient()
    c.on('disconnect', () => { client = null; set({ status: 'idle', name: undefined, model: undefined }) })
    const info = await c.connect()
    client = c
    const meta = c.getModelMetadata()
    set({ status: 'connected', name: info.deviceName ?? meta?.model ?? 'NIIMBOT', model: meta?.model ? String(meta.model) : undefined, head: meta?.printheadPixels ?? 384 })
  } catch (e) {
    client = null
    const msg = String((e as Error)?.message || e)
    // closing the chooser is not an error worth shouting about
    set({ status: /cancel|chosen|User/i.test(msg) ? 'idle' : 'error', error: msg })
    throw e
  }
}

export async function disconnectPrinter() {
  try { await client?.disconnect() } catch { /* ignore */ }
  client = null
  set({ status: 'idle', name: undefined, model: undefined })
}

/**
 * Puts a label canvas onto a page the width of the print head, centred, turned a quarter when the template
 * says so (its short side across the head), and thresholded to pure black and white.
 */
export function toPage(label: HTMLCanvasElement, rotate: boolean, head = state.head): HTMLCanvasElement {
  const w = rotate ? label.height : label.width
  const h = rotate ? label.width : label.height
  const page = document.createElement('canvas')
  page.width = head
  page.height = h
  const x = page.getContext('2d', { willReadFrequently: true })!
  x.fillStyle = '#fff'; x.fillRect(0, 0, head, h)
  x.save()
  x.translate(Math.round((head - w) / 2), 0)
  if (rotate) { x.translate(w, 0); x.rotate(Math.PI / 2) }
  x.drawImage(label, 0, 0)
  x.restore()
  const img = x.getImageData(0, 0, head, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i + 3] < 128 ? 255 : (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) < 150 ? 0 : 255
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255
  }
  x.putImageData(img, 0, 0)
  return page
}

/** Prints pages in order, each with its own number of copies. Connects first if needed (call from a tap). */
export async function printPages(pages: { canvas: HTMLCanvasElement; copies: number }[], paper: Paper = 'white'): Promise<void> {
  if (!pages.length) return
  if (!client || state.status !== 'connected') await connectPrinter()
  if (!client || !lib) throw new Error('not_connected')
  const total = pages.reduce((a, p) => a + Math.max(1, p.copies), 0)
  const meta = client.getModelMetadata()
  const taskName = client.getPrintTaskType() ?? 'B1'
  set({ status: 'printing', progress: { done: 0, total }, error: undefined })
  const task = client.protocol.newPrintTask(taskName, {
    totalPages: total,
    density: Math.min(meta?.densityMax ?? 5, Math.max(meta?.densityMin ?? 1, getDensity())),
    labelType: paper === 'clear' ? lib.LabelType.Transparent : lib.LabelType.WithGaps,
  })
  let done = 0
  try {
    await task.printInit()
    for (const p of pages) {
      const enc = lib.ImageEncoder.encodeCanvas(p.canvas, lib.PageColorType.SingleColor, meta?.printDirection ?? 'top')
      const n = Math.max(1, p.copies)
      await task.printPage(enc, n)
      await task.waitForPageFinished()
      done += n
      set({ progress: { done, total } })
    }
    await task.waitForFinished()
  } catch (e) {
    set({ error: String((e as Error)?.message || e) })
    throw e
  } finally {
    try { await client?.protocol.printEnd() } catch { /* ignore */ }
    set({ status: client ? 'connected' : 'idle', progress: undefined })
  }
}
