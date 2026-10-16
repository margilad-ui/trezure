import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Oki } from './Oki'
import { useT } from '../i18n'
import { href, onLink } from '../lib/router'
import { play } from '../lib/sound'

const LS = 'tz.hello'

/**
 * First run greeting. OKI waves, says one line, and leaves. Shown once per device (localStorage).
 * The voice line only plays if OKI's voice is switched on in settings (on by default, one tap to turn off).
 */
export function OkiHello({ force }: { force?: boolean } = {}) {
  const { t, lang } = useT()
  const [show, setShow] = useState(() => { if (force) return true; try { return !localStorage.getItem(LS) } catch { return false } })
  // the voice line plays once when the card appears (not on animation events: every blink starts one)
  useEffect(() => { if (show) play('oki-you-got-it') }, [show])
  if (!show) return null
  const dismiss = () => { try { localStorage.setItem(LS, String(Date.now())) } catch { /* ignore */ } setShow(false) }
  return (
    <div className="oki-hello tz-card" role="status">
      <Oki size={88} pose="wave" flip={lang === 'he'} className="enter" />
      <div className="oki-hello-text">
        <p className="lead">{t('hello.line')}</p>
        <p className="dim">{t('hello.sub')}</p>
        <p className="dim" style={{ fontSize: 'var(--fs-meta)' }}>{t('hello.voice')} <a href={href('/settings')} onClick={e => { try { sessionStorage.setItem('tz.settings.focus', 'sounds') } catch { /* ignore */ } dismiss(); onLink(e) }} style={{ fontWeight: 700 }}>{t('hello.voice.link')}</a></p>
        <div className="row" style={{ gap: 10, marginBlockStart: 6 }}>
          <a className="tz-btn" href={href('/capture')} onClick={e => { dismiss(); onLink(e) }}>{t('nav.capture')}</a>
          <button type="button" className="tz-btn quiet" onClick={dismiss}>{t('hello.later')}</button>
        </div>
      </div>
      <button type="button" className="icon oki-hello-x" aria-label={t('common.close')} onClick={dismiss}><X size={18} /></button>
    </div>
  )
}
