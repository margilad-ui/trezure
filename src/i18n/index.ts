import { useSyncExternalStore } from 'react'
import { he, type Key } from './he'
import { en } from './en'

export type Lang = 'he' | 'en'
const dict: Record<Lang, Record<Key, string>> = { he, en }
const LS = 'tz.lang'

let lang: Lang = ((): Lang => {
  try { const v = localStorage.getItem(LS); if (v === 'he' || v === 'en') return v } catch { /* ignore */ }
  return 'he'
})()

const listeners = new Set<() => void>()

export function getLang(): Lang { return lang }

export function setLang(l: Lang) {
  lang = l
  try { localStorage.setItem(LS, l) } catch { /* ignore */ }
  applyDir()
  listeners.forEach(f => f())
}

export function applyDir() {
  const el = document.documentElement
  el.lang = lang
  el.dir = lang === 'he' ? 'rtl' : 'ltr'
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s: string = dict[lang][key] ?? he[key] ?? key
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]))
  return s
}

export function useT() {
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => lang,
  )
  return { t, lang }
}

/** Date label: today / yesterday / short date, in the current language. */
export function dayLabel(iso: string): string {
  const d = new Date(iso); const now = new Date()
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(d, now)) return t('inbox.today')
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (sameDay(d, y)) return t('inbox.yesterday')
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' })
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
}

export type { Key }
