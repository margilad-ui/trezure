import { useState } from 'react'
import { Loader2, KeyRound, Check } from 'lucide-react'
import { useT, setLang } from '../i18n'
import { useStore, refreshRefs } from '../lib/store'
import { saveSecret } from '../lib/api'
import { supabase } from '../lib/supabase'
import { getSoundPrefs, setSoundPrefs, type SoundPrefs } from '../lib/sound'
import { toast } from '../components/Toast'
import { VERSION } from './About'

export function Settings() {
  const { t, lang } = useT()
  const { workspace, hasKey, session } = useStore()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [snd, setSnd] = useState<SoundPrefs>(getSoundPrefs())
  const [wsName, setWsName] = useState(workspace?.name ?? '')

  async function saveKey() {
    if (!workspace || !key.trim()) return
    setBusy(true)
    try { await saveSecret(workspace.id, 'anthropic', key.trim()); setKey(''); await refreshRefs(); toast(t('settings.key.saved'), 'ok') }
    catch (e) { toast(String((e as Error).message), 'err') } finally { setBusy(false) }
  }
  async function saveName() {
    if (!workspace || !wsName.trim() || wsName === workspace.name) return
    const { error } = await supabase.from('workspaces').update({ name: wsName.trim() }).eq('id', workspace.id)
    if (error) toast(error.message, 'err'); else { toast(t('settings.saved'), 'ok'); location.reload() }
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

        <div className="tz-card">
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
