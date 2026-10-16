import { useT } from '../i18n'
import { Logo } from '../components/Logo'
import { OkiPhoto } from '../components/Oki'
import { BASE } from '../lib/router'

export const VERSION = '0.1.0'

export function About() {
  const { t } = useT()
  return (
    <section className="screen">
      <div className="screen-h"><h1>{t('about.title')}</h1></div>
      <div className="tz-card" style={{ display: 'grid', gap: 18, justifyItems: 'center', textAlign: 'center', padding: 32 }}>
        <OkiPhoto size={160} />
        <Logo width={200} />
        <p className="tagline">{t('app.tagline')}</p>
        <p style={{ maxInlineSize: 520 }}>{t('about.body')}</p>
        <p className="dim" style={{ maxInlineSize: 520 }}>{t('about.oki')}</p>
        <p className="meta">{t('about.version', { v: VERSION })}</p>
        <div className="zur" style={{ marginBlockStart: 8 }}>
          <img src={`${BASE}/zur/ZUR-black-lockup.png`} alt="ZUR" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          <span>{t('footer.built')}</span>
        </div>
      </div>
    </section>
  )
}
