import { useSyncExternalStore } from 'react'

type Action = { label: string; run: () => void }
type Toast = { id: number; text: string; kind?: 'ok' | 'err' | 'info'; action?: Action }
let toasts: Toast[] = []
const ls = new Set<() => void>()
let n = 0

const drop = (id: number) => { toasts = toasts.filter(t => t.id !== id); ls.forEach(f => f()) }

/** A short message. With an action (undo) it stays longer and the button dismisses it. */
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 2400, action?: Action) {
  const id = ++n
  toasts = [...toasts, { id, text, kind, action }]
  ls.forEach(f => f())
  setTimeout(() => drop(id), action ? Math.max(ms, 6000) : ms)
  return id
}

export function Toasts() {
  const list = useSyncExternalStore((cb) => { ls.add(cb); return () => { ls.delete(cb) } }, () => toasts)
  if (!list.length) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map(t => (
        <div key={t.id} className={`toast ${t.kind ?? ''}`}>
          <span>{t.text}</span>
          {t.action && <button type="button" className="toast-act" onClick={() => { drop(t.id); t.action!.run() }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  )
}
