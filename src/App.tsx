import { useEffect } from 'react'
import { Camera, Search as SearchIcon, Inbox as InboxIcon, Settings as SettingsIcon, Info, LogOut, MapPin } from 'lucide-react'
import { useRoute, href, onLink, navigate } from './lib/router'
import { useStore, boot, signOut } from './lib/store'
import { useT, applyDir } from './i18n'
import { Logo } from './components/Logo'
import { Toasts } from './components/Toast'
import { Login } from './screens/Login'
import { Welcome } from './screens/Welcome'
import { Capture } from './screens/Capture'
import { Inbox } from './screens/Inbox'
import { Search } from './screens/Search'
import { ItemScreen } from './screens/Item'
import { Settings } from './screens/Settings'
import { About } from './screens/About'
import { More } from './screens/More'
import { Locations } from './screens/Locations'
import { DevUI } from './screens/DevUI'
import { Oki } from './components/Oki'
import { flush } from './lib/queue'
import { cleanMissing, ensureCleanThumbs } from './lib/api'

export function App() {
  const route = useRoute()
  const { ready, session, workspace, hasCleanKey } = useStore()
  const { t } = useT()

  useEffect(() => { applyDir(); void boot() }, [])
  useEffect(() => { if (session) void flush() }, [session])
  // once per session: send any image still without a cutout to cleanup (retries failures from earlier runs)
  useEffect(() => {
    if (!workspace || !hasCleanKey) return
    try { if (sessionStorage.getItem('tz.clean.swept')) return; sessionStorage.setItem('tz.clean.swept', '1') } catch { /* ignore */ }
    void cleanMissing(workspace.id).catch(() => {})
    try { if (!localStorage.getItem('tz.clean.thumbs.v1')) { localStorage.setItem('tz.clean.thumbs.v1', '1'); void ensureCleanThumbs(workspace.id).catch(() => {}) } } catch { /* ignore */ }
  }, [workspace, hasCleanKey])

  // component gallery: no auth, no network, used for layout checks at every width
  if (route === '/dev/ui') return <DevUI />

  if (!ready) return <div className="login"><Oki size={96} expression="thinking" /></div>
  if (!session) return <Login />
  if (!workspace) return <Welcome />

  if (route === '/capture') return <><Capture /><Toasts /></>

  let page = <Search />
  if (route === '/inbox') page = <Inbox />
  else if (route.startsWith('/item/')) page = <ItemScreen id={route.slice('/item/'.length)} />
  else if (route === '/locations') page = <Locations />
  else if (route.startsWith('/loc/')) page = <Locations id={route.slice('/loc/'.length)} />
  else if (route === '/settings') page = <Settings />
  else if (route === '/about') page = <About />
  else if (route === '/more') page = <More />

  const nav = [
    { to: '/', icon: <SearchIcon />, label: t('nav.search'), match: (r: string) => r === '/' || r.startsWith('/item/') },
    { to: '/capture', icon: <Camera />, label: t('nav.capture'), match: (r: string) => r === '/capture' },
    { to: '/inbox', icon: <InboxIcon />, label: t('nav.inbox'), match: (r: string) => r === '/inbox' },
    { to: '/locations', icon: <MapPin />, label: t('loc.title'), match: (r: string) => r === '/locations' || r.startsWith('/loc/'), wide: true },
  ]

  return (
    <div className="app">
      <header className="topbar">
        <div className="wrap">
          <a href={href('/')} onClick={onLink} aria-label="TREZURE"><Logo width={120} /></a>
          <nav className="topnav" aria-label="main">
            {nav.map(n => <a key={n.to} href={href(n.to)} onClick={onLink} aria-current={n.match(route) ? 'page' : undefined}>{n.icon}{n.label}</a>)}
          </nav>
          <nav className="topnav" style={{ flex: 'none' }} aria-label="secondary">
            <a href={href('/settings')} onClick={onLink} aria-current={route === '/settings' ? 'page' : undefined}><SettingsIcon />{t('nav.settings')}</a>
            <a href={href('/about')} onClick={onLink} aria-current={route === '/about' ? 'page' : undefined}><Info />{t('nav.about')}</a>
            <a href="#" onClick={e => { e.preventDefault(); void signOut().then(() => navigate('/')) }}><LogOut />{t('nav.logout')}</a>
          </nav>
        </div>
      </header>
      <main className="main"><div className="wrap">{page}
        <footer className="footer">
          <span>{workspace.name}</span>
          <span className="zur">{t('footer.built')}</span>
        </footer>
      </div></main>
      <nav className="bottomnav" aria-label="main">
        {nav.filter(n => !n.wide).map(n => <a key={n.to} href={href(n.to)} onClick={onLink} aria-current={n.match(route) ? 'page' : undefined}>{n.icon}<span>{n.label}</span></a>)}
        <a href={href('/more')} onClick={onLink} aria-current={['/more', '/settings', '/about', '/locations'].includes(route) || route.startsWith('/loc/') ? 'page' : undefined}><SettingsIcon /><span>{t('nav.more')}</span></a>
      </nav>
      <Toasts />
    </div>
  )
}
