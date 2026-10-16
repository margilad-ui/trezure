/**
 * /dev/ui  Component gallery with fake data. No auth, no network.
 * Exists so every control can be screenshot and measured at phone, tablet and desktop widths
 * before anything ships. Not linked from the app.
 */
import { useState, type CSSProperties } from 'react'
import { Check, SkipForward, Trash2, RefreshCw, Loader2, AlertTriangle, Search as SearchIcon, Camera, X, ImagePlus } from 'lucide-react'
import { useT, type Key } from '../i18n'
import { Logo } from '../components/Logo'
import { OkiMark, Oki } from '../components/Oki'
import { UNITS } from '../lib/seed'
import type { Kind } from '../lib/types'

const SAMPLES = [
  { name: 'מסגרת תמונה לבנה RIBBA', brand: 'IKEA', cat: 'ציוד יצירה', loc: 'משרד · ארון 3 · מדף 2', color: '#1EA5A0', qty: 4, unit: 'unit', kind: 'equipment' as Kind, oki: 'נראה לי מסגרת תמונה לבנה RIBBA, IKEA. נכון?', st: 'done' },
  { name: '', brand: '', cat: '', loc: 'מחסן · מדף עליון', color: '#9A6B3F', qty: 1, unit: 'roll', kind: 'consumable' as Kind, oki: 'צלם את הצד עם הכיתוב, לא קראתי.', st: 'reshoot' },
  { name: 'לוח קנבס 40 על 50', brand: '', cat: 'ציוד יצירה', loc: 'בית · סטודיו', color: '#3FA34D', qty: 12, unit: 'unit', kind: 'consumable' as Kind, oki: 'OKI מסתכל', st: 'pending' },
]

function Card({ s, i }: { s: typeof SAMPLES[0]; i: number }) {
  const { t } = useT()
  const [qty, setQty] = useState(s.qty)
  const [kind, setKind] = useState<Kind>(s.kind)
  return (
    <div className={`tz-card card-item ${i === 0 ? 'focus' : ''}`}>
      <div className="ci-head">
        <div className="pic" style={{ background: 'linear-gradient(135deg,#cfe3e6,#9fc3c8)' }} />
        <div className="grow">
          <div className={`oki-line ${s.st === 'reshoot' ? 'warn' : ''}`}>
            {s.st === 'pending' ? <Loader2 size={26} className="spin" style={{ color: 'var(--teal)' }} />
              : s.st === 'reshoot' ? <AlertTriangle size={26} style={{ color: 'var(--warning)' }} />
              : <OkiMark size={26} />}
            <p>{s.oki}</p>
            {s.st === 'reshoot' && <button type="button" className="icon" style={{ inlineSize: 44, blockSize: 44 }}><RefreshCw size={16} /></button>}
          </div>
          <label className="row" style={{ gap: 8, cursor: 'pointer', color: 'var(--dim)', fontSize: 'var(--fs-meta)', fontWeight: 600 }}>
            <input type="checkbox" className="check" defaultChecked={i === 1} /> {t('inbox.select')}
          </label>
        </div>
      </div>
      <div className="fields">
        <div className="field wide-2"><label>{t('field.name')}</label><input className="tz-input" defaultValue={s.name} /></div>
        <div className={`field ${s.st === 'done' ? '' : 'low'}`}><label>{t('field.brand')}</label><input className="tz-input" defaultValue={s.brand} /></div>
        <div className="field"><label>{t('field.category')}</label>
          <select className="tz-input" defaultValue=""><option value="">{s.cat || t('field.choose')}</option></select>
        </div>
        <div className="field"><label>{t('field.location')}</label>
          <button type="button" className="tz-input" style={{ textAlign: 'start', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i style={{ inlineSize: 10, blockSize: 10, borderRadius: '50%', background: s.color, flex: 'none' }} />
            <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.loc}</span>
          </button>
        </div>
        {i === 0 && <>
          <div className="field"><label>צבע</label><input className="tz-input" defaultValue="לבן" /></div>
          <div className="field"><label>רוחב (cm)</label><input className="tz-input" type="number" defaultValue={40} /></div>
        </>}
      </div>
      <div className="card-actions">
        <div className="ca-row">
          <div className="qty-ctl">
            <button type="button" onClick={() => setQty(q => Math.max(0, q - 1))} aria-label="-1">&#8722;</button>
            <input value={qty} onChange={e => setQty(Number(e.target.value) || 0)} aria-label={t('field.qty')} />
            <button type="button" onClick={() => setQty(q => q + 1)} aria-label="+1">+</button>
          </div>
          <select className="tz-input unit" defaultValue={s.unit}>{UNITS.map(u => <option key={u} value={u}>{t(`unit.${u}` as Key)}</option>)}</select>
          <div className="seg">
            {(['equipment', 'consumable'] as Kind[]).map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{t(`kind.${k}` as Key)}</button>)}
          </div>
        </div>
        <div className="ca-end">
          <button type="button" className="icon" style={{ color: 'var(--danger)' }} aria-label={t('inbox.archive')}><Trash2 size={18} /></button>
          <button type="button" className="tz-btn ghost"><SkipForward size={16} /> {t('inbox.skip')}</button>
          <button type="button" className="tz-btn"><Check size={18} /> {t('inbox.approve')}</button>
        </div>
      </div>
    </div>
  )
}

export function DevUI() {
  const { t } = useT()
  const H = ({ children }: { children: string }) => (
    <h2 style={{ fontSize: 'var(--fs-h3)', marginBlock: '28px 12px', paddingBlockEnd: 6, borderBlockEnd: '2px solid var(--line)' }}>{children}</h2>
  )
  return (
    <div className="wrap" style={{ paddingBlock: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Logo width={120} />
        <span className="meta">/dev/ui</span>
      </div>

      <H>כרטיסי סידור</H>
      <div className="stack">{SAMPLES.map((s, i) => <Card key={i} s={s} i={i} />)}</div>

      <H>שורת בחירה מרובה</H>
      <div className="bulkbar tz-card">
        <strong>{t('inbox.selected', { n: 3 })}</strong>
        <select className="tz-input" style={{ inlineSize: 'auto', minBlockSize: 40 }}><option>{t('inbox.bulk.category')}</option></select>
        <button type="button" className="tz-btn quiet sm">{t('inbox.bulk.location')}</button>
        <select className="tz-input" style={{ inlineSize: 'auto', minBlockSize: 40 }}><option>{t('inbox.bulk.kind')}</option></select>
        <span className="grow" />
        <button type="button" className="tz-btn ghost sm">{t('inbox.clear')}</button>
        <button type="button" className="tz-btn sm"><Check size={16} /> {t('inbox.bulk.approve')}</button>
      </div>

      <H>חיפוש</H>
      <div className="search-bar"><SearchIcon size={22} /><input className="tz-input" placeholder={t('search.placeholder')} /></div>
      <div className="chips" style={{ marginBlockStart: 10 }}>
        <select className="chip-btn" style={{ appearance: 'auto' }}><option>{t('search.filter.category')}</option></select>
        <select className="chip-btn" style={{ appearance: 'auto' }}><option>{t('search.filter.location')}</option></select>
        <button type="button" className="chip-btn" aria-pressed="true">{t('kind.equipment')}</button>
        <button type="button" className="chip-btn">{t('kind.consumable')}</button>
        <button type="button" className="chip-btn">{t('stock.low')}</button>
        <button type="button" className="chip-btn">{t('search.inbox')} 3</button>
      </div>
      <div className="results">
        {SAMPLES.map((s, i) => (
          <div key={i} className="res-row">
            <div style={{ inlineSize: 64, blockSize: 64, borderRadius: 12, background: 'linear-gradient(135deg,#cfe3e6,#9fc3c8)' }} />
            <div className="grow">
              <div className="name">{s.name || 'בלי שם'}{s.brand && <span className="dim" style={{ fontWeight: 400 }}> · {s.brand}</span>}</div>
              <div className="sub">
                <span className="tz-loc" style={{ '--c': s.color, fontSize: 'var(--fs-label)', padding: '2px 8px' } as CSSProperties}><i aria-hidden="true" />{s.loc}</span>
                <span className="meta">{s.cat}</span>
                {i === 1 && <span className="badge-stock low">{t('stock.low')}</span>}
              </div>
            </div>
            <div className="qty-ctl">
              <button type="button" aria-label="-1">&#8722;</button>
              <span className="qty">{s.qty}</span>
              <button type="button" aria-label="+1">+</button>
            </div>
          </div>
        ))}
      </div>

      <H>כפתורים ושדות</H>
      <div className="tz-card stack">
        <div className="row">
          <button className="tz-btn">ראשי</button>
          <button className="tz-btn ghost">משני</button>
          <button className="tz-btn quiet">שקט</button>
          <button className="tz-btn sm">קטן</button>
          <button className="tz-btn" disabled>מושבת</button>
          <button className="icon"><Camera size={20} /></button>
        </div>
        <div className="fields">
          <div className="field"><label>שדה טקסט</label><input className="tz-input" defaultValue="מסגרת תמונה לבנה RIBBA" /></div>
          <div className="field low"><label>ביטחון נמוך</label><input className="tz-input" defaultValue="לא בטוח" /></div>
          <div className="field"><label>בחירה</label><select className="tz-input"><option>אפשרות</option></select></div>
        </div>
        <div className="row">
          <span className="tz-chip">צ'יפ</span>
          <span className="tz-loc" style={{ '--c': '#E5484D' } as CSSProperties}><i aria-hidden="true" />בית · מטבח</span>
          <span className="badge-stock low">{t('stock.low')}</span>
          <span className="badge-stock empty">{t('stock.empty')}</span>
          <span className="badge-stock inbox">{t('stage.inbox')}</span>
        </div>
        <div className="row">
          <span className="kbd">Enter</span><span className="kbd">Tab</span><span className="kbd">Esc</span>
          <div className="seg"><button aria-pressed="true">עברית</button><button>English</button></div>
          <button type="button" role="switch" aria-checked="true" className="switch" aria-label="מתג" />
        </div>
      </div>

      <H>מצב ריק</H>
      <div className="empty"><Oki size={140} className="oki" /><p style={{ fontSize: 'var(--fs-lead)', color: 'var(--ink)' }}>{t('search.empty')}</p><button className="tz-btn">{t('nav.capture')}</button></div>

      <H>שורת צילום</H>
      <div style={{ background: '#0a1520', borderRadius: 'var(--r-lg)', padding: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBlockEnd: 12 }}>
          <span className="tz-loc" style={{ '--c': '#1EA5A0', color: '#fff', background: 'color-mix(in srgb, #1EA5A0 36%, #0a1520)', border: '1.5px solid color-mix(in srgb,#1EA5A0 70%,white)', minBlockSize: 44, paddingInline: 14 } as CSSProperties}><i aria-hidden="true" /><span className="mono" style={{ fontSize: 'var(--fs-label)' }}>OF</span>משרד · ארון 3</span>
          <span className="shot-count"><OkiMark size={20} color="rgba(255,255,255,.92)" eye="#0a1520" /><span className="mono">7</span></span>
          <button className="capture-close icon" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}><X size={22} /></button>
        </div>
        <div className="capture-controls" style={{ padding: 0 }}>
          <button className="side-btn"><ImagePlus size={24} /><span>+ {t('capture.angle')}</span></button>
          <button className="shutter" />
          <button className="side-btn"><span className="big">&#215;1</span><span>{t('capture.qty')}</span></button>
        </div>
        <div className="capture-foot" style={{ padding: '12px 0 0' }}>
          <button className="tz-btn finish"><Check size={20} /> {t('capture.finish', { n: 7 })}</button>
        </div>
      </div>
      <div style={{ blockSize: 60 }} />
    </div>
  )
}
