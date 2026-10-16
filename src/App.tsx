import { useEffect } from 'react'
import { Camera, Search as SearchIcon, Inbox as InboxIcon, Settings as SettingsIcon, Info, LogOut } from 'lucide-react'
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
import { Oki } from './components/Oki'
import { flush } from './lib/queue'

export function App() {
  const route = useRoute()
  const { ready, session, workspace } = useStore()
  const { t } = useT()

  useEffect(() => { applyDir(); void boot() }, [])
  useEffect(() => { if (session) void flush() }, [session])

  if (!ready) return <div className="login"><Oki size={96} /></div>
  if (!session) return <Login />
  if (!workspace) return <Welcome />

  if (route === '/capture') return <><Capture /><Toasts /></>

  let page = <Search />
  if (route === '/inbox') page = <Inbox />
  else if (route.startsWith('/item/')) page = <ItemScreen id={route.slice('/item/'.length)} />
  else if (route === '/settings') page = <Settings />
  else if (route === '/about') page = <About />
  else if (route === '/more') page = <More />

  const nav = [
    { to: '/', icon: <SearchIcon />, label: t('nav.search'), match: (r: string) => r === '/' || r.startsWith('/item/') },
    { to: '/capture', icon: <Camera />, label: t('nav.capture'), match: (r: string) => r === '/capture' },
    { to: '/inbox', icon: <InboxIcon />, label: t('nav.inbox'), match: (r: string) => r === '/inbox' },
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
        {nav.map(n => <a key={n.to} href={href(n.to)} onClick={onLink} aria-current={n.match(route) ? 'page' : undefined}>{n.icon}<span>{n.label}</span></a>)}
        <a href={href('/more')} onClick={onLink} aria-current={['/more', '/settings', '/about'].includes(route) ? 'page' : undefined}><SettingsIcon /><span>{t('nav.more')}</span></a>
      </nav>
      <Toasts />
    </div>
  )
}
