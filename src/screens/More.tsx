import { Settings as SettingsIcon, Info, LogOut, ChevronLeft } from 'lucide-react'
import { useT } from '../i18n'
import { href, onLink, navigate } from '../lib/router'
import { signOut, useStore } from '../lib/store'
import { Logo } from '../components/Logo'

export function More() {
  const { t } = useT()
  const { workspace, session } = useStore()
  return (
    <section className="screen">
      <div className="screen-h"><h1>{t('nav.more')}</h1></div>
      <div className="tz-card stack">
        <div className="meta">{workspace?.name} · <span dir="ltr">{session?.user.email}</span></div>
        <a className="list-row" href={href('/settings')} onClick={onLink}><SettingsIcon /><span className="grow">{t('nav.settings')}</span><ChevronLeft className="dim" /></a>
        <a className="list-row" href={href('/about')} onClick={onLink}><Info /><span className="grow">{t('nav.about')}</span><ChevronLeft className="dim" /></a>
        <button type="button" className="list-row" onClick={() => void signOut().then(() => navigate('/'))}><LogOut /><span className="grow">{t('nav.logout')}</span></button>
      </div>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 8, marginBlockStart: 32 }}>
        <Logo width={110} />
        <span className="zur">{t('footer.built')}</span>
      </div>
    </section>
  )
}
