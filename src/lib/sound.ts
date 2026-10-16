import { BASE } from './router'

export type SoundName = 'open' | 'capture' | 'found' | 'sorted' | 'question' | 'low-stock' | 'complete' | 'oki-you-got-it' | 'oki-okay-he'

const LS = 'tz.sounds'
export type SoundPrefs = { capture: boolean; found: boolean; sorted: boolean; complete: boolean; okiVoice: boolean }
const DEFAULT: SoundPrefs = { capture: true, found: true, sorted: false, complete: false, okiVoice: false }

export function getSoundPrefs(): SoundPrefs {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(LS) || '{}') } } catch { return DEFAULT }
}
export function setSoundPrefs(p: Partial<SoundPrefs>) {
  try { localStorage.setItem(LS, JSON.stringify({ ...getSoundPrefs(), ...p })) } catch { /* ignore */ }
}

const cache = new Map<SoundName, HTMLAudioElement>()
function el(name: SoundName) {
  let a = cache.get(name)
  if (!a) { a = new Audio(`${BASE}/sound/${name}.mp3`); a.preload = 'auto'; cache.set(name, a) }
  return a
}

/** Plays a brand sound if the matching preference is on. Never throws. */
export function play(name: SoundName) {
  const p = getSoundPrefs()
  const gate: Partial<Record<SoundName, boolean>> = {
    capture: p.capture, found: p.found, sorted: p.sorted, complete: p.complete,
    'oki-you-got-it': p.okiVoice, 'oki-okay-he': p.okiVoice, open: false, question: p.sorted, 'low-stock': p.found,
  }
  if (!gate[name]) return
  try { const a = el(name); a.currentTime = 0; void a.play().catch(() => {}) } catch { /* ignore */ }
}

export function vibrate(ms = 30) {
  try { navigator.vibrate?.(ms) } catch { /* ignore */ }
}
