import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Oki } from '../components/Oki'
import { useT, setLang } from '../i18n'
import { supabase } from '../lib/supabase'
import { BASE } from '../lib/router'

export function Login() {
  const { t, lang } = useT()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function send(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}${BASE}/`, shouldCreateUser: true },
    })
    setBusy(false)
    if (error) { setErr(t('login.error')); return }
    setSent(true)
  }

  async function verify(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setErr(t('login.badcode'))
  }

  return (
    <div className="login">
      <div className="login-card">
        <Oki size={120} className="oki-wave" />
        <Logo width={200} className="login-logo" />
        <p className="tagline">{t('app.tagline')}</p>
        <form className="tz-card" onSubmit={sent ? verify : send}>
          {!sent ? (
            <>
              <label className="tz-label" htmlFor="email">{t('login.email')}</label>
              <input id="email" className="tz-input" type="email" inputMode="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} dir="ltr" />
              <button className="tz-btn" type="submit" disabled={busy}>{busy ? <><Loader2 className="spin" size={18} /> {t('login.sending')}</> : t('login.send')}</button>
            </>
          ) : (
            <>
              <p className="dim" style={{ fontSize: 'var(--fs-sm)' }}>{t('login.sent')}</p>
              <label className="tz-label" htmlFor="code">{t('login.code')}</label>
              <input id="code" className="tz-input code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" value={code} onChange={e => setCode(e.target.value)} />
              <button className="tz-btn" type="submit" disabled={busy || code.trim().length < 6}>{busy ? <Loader2 className="spin" size={18} /> : t('login.verify')}</button>
              <button className="tz-btn ghost" type="button" onClick={() => { setSent(false); setCode('') }}>{t('common.cancel')}</button>
            </>
          )}
          {err && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{err}</p>}
        </form>
        <div className="seg" style={{ justifySelf: 'center' }}>
          <button type="button" aria-pressed={lang === 'he'} onClick={() => setLang('he')}>עברית</button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
        </div>
        <div className="zur">{t('footer.built')}</div>
      </div>
    </div>
  )
}
