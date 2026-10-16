import { useEffect, useRef, useState } from 'react'
import { Loader2, KeyRound, Check, Lock, Wand2 } from 'lucide-react'
import { useT, setLang } from '../i18n'
import { useStore, refreshRefs } from '../lib/store'
import { saveSecret, cleanMissing } from '../lib/api'
import { supabase } from '../lib/supabase'
import { getSoundPrefs, setSoundPrefs, type SoundPrefs } from '../lib/sound'
import { toast } from '../components/Toast'
import { VERSION } from './About'

export function Settings() {
  const { t, lang } = useT()
  const { workspace, hasKey, hasCleanKey, session } = useStore()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [ckey, setCkey] = useState('')
  const [cbusy, setCbusy] = useState(false)
  const [sweeping, setSweeping] = useState(false)
  async function sweep() {
    if (!workspace) return
    setSweeping(true)
    try { const n = await cleanMissing(workspace.id); toast(n ? t('settings.ckey.backfill', { n }) : t('settings.ckey.nothing'), 'ok', 4000) }
    catch (e) { toast(String((e as Error).message), 'err') } finally { setSweeping(false) }
  }
  const [snd, setSnd] = useState<SoundPrefs>(getSoundPrefs())
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [wsName, setWsName] = useState(workspace?.name ?? '')
  const soundsRef = useRef<HTMLDivElement>(null)
  const [focusSounds, setFocusSounds] = useState(false)
  useEffect(() => {
    let f = ''
    try { f = sessionStorage.getItem('tz.settings.focus') ?? ''; sessionStorage.removeItem('tz.settings.focus') } catch { /* ignore */ }
    if (f !== 'sounds') return
    setFocusSounds(true)
    window.setTimeout(() => soundsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    const id = window.setTimeout(() => setFocusSounds(false), 2600)
    return () => window.clearTimeout(id)
  }, [])

  async function saveKey() {
    if (!workspace || !key.trim()) return
    setBusy(true)
    try { await saveSecret(workspace.id, 'anthropic', key.trim()); setKey(''); await refreshRefs(); toast(t('settings.key.saved'), 'ok') }
    catch (e) { toast(String((e as Error).message), 'err') } finally { setBusy(false) }
  }
  async function saveCleanKey() {
    if (!workspace || !ckey.trim()) return
    setCbusy(true)
    try {
      await saveSecret(workspace.id, 'replicate', ckey.trim()); setCkey(''); await refreshRefs(); toast(t('settings.ckey.saved'), 'ok')
      const n = await cleanMissing(workspace.id)
      if (n) toast(t('settings.ckey.backfill', { n }), 'ok', 4000)
    }
    catch (e) { toast(String((e as Error).message), 'err') } finally { setCbusy(false) }
  }
  async function saveName() {
    if (!workspace || !wsName.trim() || wsName === workspace.name) return
    const { error } = await supabase.from('workspaces').update({ name: wsName.trim() }).eq('id', workspace.id)
    if (error) toast(error.message, 'err'); else { toast(t('settings.saved'), 'ok'); location.reload() }
  }
  async function savePassword() {
    if (pw1.length < 8) { toast(t('settings.password.short'), 'err'); return }
    if (pw1 !== pw2) { toast(t('settings.password.mismatch'), 'err'); return }
    setPwBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setPwBusy(false)
    if (error) { toast(error.message, 'err'); return }
    setPw1(''); setPw2('')
    try { localStorage.setItem('tz.login.mode', 'password') } catch { /* ignore */ }
    toast(t('settings.password.saved'), 'ok', 4000)
  }

  const toggle = (k: keyof SoundPrefs) => { const n = { ...snd, [k]: !snd[k] }; setSnd(n); setSoundPrefs(n) }
  const Switch = ({ k, label }: { k: keyof SoundPrefs; label: string }) => (
    <div className="setting-row"><span>{label}</span><button type="button" role="switch" aria-checked={snd[k]} className="switch" onClick={() => toggle(k)} aria-label={label} /></div>
  )

  return (
    <section className="screen">
      <div className="screen-h"><h1>{t('settings.title')}</h1></div>
      <div className="stack" style={{ gap: 16, maxInlineSize: 640 }}>
        <div className="tz-card">
          <div className="setting-row"><span>{t('settings.lang')}</span>
            <div className="seg"><button type="button" aria-pressed={lang === 'he'} onClick={() => setLang('he')}>עברית</button><button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button></div>
          </div>
          <div className="setting-row"><span>{t('settings.workspace')}</span>
            <div className="row"><input className="tz-input" value={wsName} onChange={e => setWsName(e.target.value)} style={{ inlineSize: 200 }} /><button type="button" className="tz-btn quiet sm" onClick={() => void saveName()} disabled={wsName === workspace?.name}>{t('item.save')}</button></div>
          </div>
          <div className="setting-row"><span>{t('settings.account')}</span><span className="meta" dir="ltr">{session?.user.email}</span></div>
        </div>

        <div className="tz-card stack" style={{ gap: 10 }}>
          <div className="row"><KeyRound size={20} style={{ color: 'var(--teal)' }} /><strong>{t('settings.key')}</strong><span className="grow" />
            <span className={`badge-stock ${hasKey ? '' : 'low'}`} style={hasKey ? { background: 'var(--teal-light)', color: 'var(--teal-dark)' } : undefined}>{hasKey ? <><Check size={12} /> {t('settings.key.set')}</> : t('settings.key.none')}</span>
          </div>
          <p className="meta">{t('settings.key.hint')}</p>
          <div className="row">
            <input className="tz-input mono" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={t('settings.key.placeholder')} dir="ltr" style={{ fontWeight: 400 }} />
            <button type="button" className="tz-btn" disabled={busy || key.trim().length < 20} onClick={() => void saveKey()}>{busy ? <Loader2 className="spin" size={18} /> : t('settings.key.save')}</button>
          </div>
        </div>

        <div className="tz-card stack" style={{ gap: 10 }}>
          <div className="row"><Wand2 size={20} style={{ color: 'var(--teal)' }} /><strong>{t('settings.ckey')}</strong><span className="grow" />
            <span className={`badge-stock ${hasCleanKey ? '' : 'low'}`} style={hasCleanKey ? { background: 'var(--teal-light)', color: 'var(--teal-dark)' } : undefined}>{hasCleanKey ? <><Check size={12} /> {t('settings.key.set')}</> : t('settings.key.none')}</span>
          </div>
          <p className="meta">{t('settings.ckey.hint')}</p>
          <div className="row">
            <input className="tz-input mono" type="password" autoComplete="off" value={ckey} onChange={e => setCkey(e.target.value)} placeholder={t('settings.ckey.placeholder')} dir="ltr" style={{ fontWeight: 400 }} />
            <button type="button" className="tz-btn" disabled={cbusy || ckey.trim().length < 20} onClick={() => void saveCleanKey()}>{cbusy ? <Loader2 className="spin" size={18} /> : t('settings.key.save')}</button>
          </div>
          {hasCleanKey && <div className="row"><button type="button" className="tz-btn quiet sm" disabled={sweeping} onClick={() => void sweep()}>{sweeping ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />} {t('settings.ckey.sweep')}</button><span className="meta">{t('settings.ckey.sweep.hint')}</span></div>}
        </div>

        <div className="tz-card stack" style={{ gap: 10 }}>
          <div className="row"><Lock size={20} style={{ color: 'var(--teal)' }} /><strong>{t('settings.password')}</strong></div>
          <p className="meta">{t('settings.password.hint')}</p>
          <input className="tz-input" type="password" autoComplete="new-password" placeholder={t('settings.password.new')}
            value={pw1} onChange={e => setPw1(e.target.value)} dir="ltr" aria-label={t('settings.password.new')} />
          <input className="tz-input" type="password" autoComplete="new-password" placeholder={t('settings.password.again')}
            value={pw2} onChange={e => setPw2(e.target.value)} dir="ltr" aria-label={t('settings.password.again')}
            onKeyDown={e => { if (e.key === 'Enter') void savePassword() }} />
          <button type="button" className="tz-btn" disabled={pwBusy || pw1.length < 8 || pw1 !== pw2} onClick={() => void savePassword()}>
            {pwBusy ? <Loader2 className="spin" size={18} /> : t('settings.password.save')}
          </button>
        </div>

        <div className={`tz-card ${focusSounds ? 'pulse-focus' : ''}`} ref={soundsRef} id="sounds">
          <div className="tz-label" style={{ marginBlockEnd: 4 }}>{t('settings.sounds')}</div>
          <Switch k="capture" label={t('settings.sound.capture')} />
          <Switch k="found" label={t('settings.sound.found')} />
          <Switch k="sorted" label={t('settings.sound.sorted')} />
          <Switch k="complete" label={t('settings.sound.complete')} />
          <Switch k="okiVoice" label={t('settings.sound.okiVoice')} />
        </div>

        <p className="meta">{t('settings.version')} {VERSION} · <span className="zur">{t('footer.built')}</span></p>
      </div>
    </section>
  )
}
