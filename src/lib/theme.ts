export type Theme = 'system' | 'light' | 'dark'
const LS = 'tz.theme'
/** Matches the meta theme-color to the bar the person actually sees. */
const BAR = { light: '#0F7B8A', dark: '#0A161C' }

export function getTheme(): Theme {
  try { const v = localStorage.getItem(LS); if (v === 'light' || v === 'dark') return v } catch { /* ignore */ }
  return 'system'
}

export function applyTheme(theme: Theme = getTheme()) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? BAR.dark : BAR.light)
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme === 'system' ? 'light dark' : theme)
}

export function setTheme(theme: Theme) {
  try { if (theme === 'system') localStorage.removeItem(LS); else localStorage.setItem(LS, theme) } catch { /* ignore */ }
  applyTheme(theme)
}

/** Follow the OS while the person is on "system". */
export function watchSystemTheme() {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  mq?.addEventListener?.('change', () => { if (getTheme() === 'system') applyTheme('system') })
}
