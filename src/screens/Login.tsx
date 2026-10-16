import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, KeyRound, Mail, ArrowRight } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Oki } from '../components/Oki'
import { useT, setLang } from '../i18n'
import { supabase } from '../lib/supabase'
import { BASE } from '../lib/router'

type Mode = 'password' | 'code'
const LS_EMAIL = 'tz.login.email'
const LS_MODE = 'tz.login.mode'

export function Login() {
  const { t, lang } = useT()
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(LS_EMAIL) ?? '' } catch { return '' } })
  const [mode, setMode] = useState<Mode>(() => { try { return (localStorage.getItem(LS_MODE) as Mode) || 'code' } catch { return 'code' } })
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  const remember = (m: Mode) => { try { localStorage.setItem(LS_EMAIL, email.trim()); localStorage.setItem(LS_MODE, m) } catch { /* ignore */ } }

  async function withPassword(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) { setErr(t('login.badpass')); return }
    remember('password')
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}${BASE}/`, shouldCreateUser: true },
    })
    setBusy(false)
    if (error) {
      setErr(error.status === 429 ? t('login.ratelimit') : t('login.error'))
      if (error.status === 429) setCooldown(60)
      return
    }
    remember('code'); setSent(true); setCooldown(60)
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setErr(t('login.badcode'))
  }

  const emailField = (
    <>
      <label className="tz-label" htmlFor="email">{t('login.email')}</label>
      <input id="email" className="tz-input" type="email" inputMode="email" autoComplete="username" required
        value={email} onChange={e => setEmail(e.target.value)} dir="ltr" />
    </>
  )

  return (
    <div className="login">
      <div className="login-card">
        <Oki size={110} className="oki-wave" />
        <Logo width={190} className="login-logo" />
        <p className="tagline">{t('app.tagline')}</p>

        {mode === 'password' ? (
          <form className="tz-card" onSubmit={withPassword}>
            {emailField}
            <label className="tz-label" htmlFor="pw">{t('login.password')}</label>
            <input id="pw" className="tz-input" type="password" autoComplete="current-password" required
              value={password} onChange={e => setPassword(e.target.value)} dir="ltr" />
            <button className="tz-btn" type="submit" disabled={busy || !email.trim() || !password}>
              {busy ? <Loader2 className="spin" size={18} /> : <><KeyRound size={18} /> {t('login.enter')}</>}
            </button>
            {err && <p role="alert" className="login-err">{err}</p>}
            <button type="button" className="tz-btn quiet" onClick={() => { setMode('code'); setErr(null) }}>
              <Mail size={18} /> {t('login.usecode')}
            </button>
          </form>
        ) : !sent ? (
          <form className="tz-card" onSubmit={sendCode}>
            {emailField}
            <p className="meta">{t('login.code.why')}</p>
            <button className="tz-btn" type="submit" disabled={busy || cooldown > 0 || !email.trim()}>
              {busy ? <><Loader2 className="spin" size={18} /> {t('login.sending')}</>
                : cooldown > 0 ? t('login.wait', { s: cooldown })
                : <><Mail size={18} /> {t('login.send')}</>}
            </button>
            {err && <p role="alert" className="login-err">{err}</p>}
            <button type="button" className="tz-btn quiet" onClick={() => { setMode('password'); setErr(null) }}>
              <KeyRound size={18} /> {t('login.usepassword')}
            </button>
          </form>
        ) : (
          <form className="tz-card" onSubmit={verifyCode}>
            <p className="dim" style={{ fontSize: 'var(--fs-sm)' }}>{t('login.sent')}</p>
            <label className="tz-label" htmlFor="code">{t('login.code')}</label>
            <input id="code" className="tz-input code-input" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]*" maxLength={8} autoFocus value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
            <button className="tz-btn" type="submit" disabled={busy || code.trim().length < 6}>
              {busy ? <Loader2 className="spin" size={18} /> : <><ArrowRight size={18} style={{ transform: lang === 'en' ? 'rotate(180deg)' : undefined }} /> {t('login.verify')}</>}
            </button>
            {err && <p role="alert" className="login-err">{err}</p>}
            <p className="meta">{t('login.link.note')}</p>
            <button type="button" className="tz-btn quiet" onClick={() => { setSent(false); setCode(''); setErr(null) }}>
              {t('common.cancel')}
            </button>
          </form>
        )}

        <div className="seg" style={{ justifySelf: 'center' }}>
          <button type="button" aria-pressed={lang === 'he'} onClick={() => setLang('he')}>עברית</button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
        </div>
        <div className="zur">{t('footer.built')}</div>
      </div>
    </div>
  )
}
