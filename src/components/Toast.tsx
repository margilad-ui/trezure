import { useSyncExternalStore } from 'react'

type Toast = { id: number; text: string; kind?: 'ok' | 'err' | 'info' }
let toasts: Toast[] = []
const ls = new Set<() => void>()
let n = 0

export function toast(text: string, kind: Toast['kind'] = 'info', ms = 2400) {
  const id = ++n
  toasts = [...toasts, { id, text, kind }]
  ls.forEach(f => f())
  setTimeout(() => { toasts = toasts.filter(t => t.id !== id); ls.forEach(f => f()) }, ms)
}

export function Toasts() {
  const list = useSyncExternalStore((cb) => { ls.add(cb); return () => { ls.delete(cb) } }, () => toasts)
  if (!list.length) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map(t => <div key={t.id} className={`toast ${t.kind ?? ''}`}>{t.text}</div>)}
    </div>
  )
}
