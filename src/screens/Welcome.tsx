import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Oki } from '../components/Oki'
import { useT } from '../i18n'
import { createWorkspaceWithSeed } from '../lib/store'
import { toast } from '../components/Toast'

export function Welcome() {
  const { t } = useT()
  const [name, setName] = useState(t('welcome.default'))
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try { await createWorkspaceWithSeed(name.trim() || t('welcome.default')) }
    catch (e) { toast(String((e as Error).message || t('common.error')), 'err'); setBusy(false) }
  }

  return (
    <div className="login">
      <div className="login-card">
        <Oki size={140} pose="wave" />
        <Logo width={160} className="login-logo" />
        <div className="tz-card">
          <h1 style={{ fontSize: 'var(--fs-h2)' }}>{t('welcome.title')}</h1>
          <p className="dim">{t('welcome.body')}</p>
          <label className="tz-label" htmlFor="wsname">{t('welcome.name')}</label>
          <input id="wsname" className="tz-input" value={name} onChange={e => setName(e.target.value)} />
          <button className="tz-btn" type="button" disabled={busy} onClick={() => void go()}>{busy ? <><Loader2 className="spin" size={18} /> {t('welcome.working')}</> : t('welcome.go')}</button>
        </div>
      </div>
    </div>
  )
}
