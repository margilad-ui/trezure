import { useSyncExternalStore } from 'react'

export const BASE = '/trezure'

const listeners = new Set<() => void>()
function emit() { listeners.forEach(f => f()) }
window.addEventListener('popstate', emit)

export function currentPath(): string {
  let p = window.location.pathname
  if (p.startsWith(BASE)) p = p.slice(BASE.length)
  if (!p.startsWith('/')) p = '/' + p
  return p.replace(/\/+$/, '') || '/'
}

export function href(path: string): string {
  return BASE + (path.startsWith('/') ? path : '/' + path)
}

export function navigate(path: string, replace = false) {
  const url = href(path)
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url)
  emit()
}

export function useRoute(): string {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    currentPath,
  )
}

/** Click handler for <a href={href(x)}>: in-app navigation without reload. */
export function onLink(e: React.MouseEvent<HTMLAnchorElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const a = e.currentTarget
  if (a.target && a.target !== '_self') return
  e.preventDefault()
  const path = a.getAttribute('href') || '/'
  navigate(path.startsWith(BASE) ? path.slice(BASE.length) || '/' : path)
}
