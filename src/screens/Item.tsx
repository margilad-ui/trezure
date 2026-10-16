import { useEffect, useState } from 'react'
import { ArrowRight, Archive, Loader2 } from 'lucide-react'
import { useT, type Key } from '../i18n'
import { useStore, catById, catName, locLabel, locColor } from '../lib/store'
import { fetchItem, updateItem, archiveItem, adjustQty } from '../lib/api'
import type { ItemWithImages, Kind } from '../lib/types'
import { publicUrl } from '../lib/supabase'
import { navigate } from '../lib/router'
import { LocationPicker } from '../components/LocationPicker'
import { toast } from '../components/Toast'
import { UNITS } from '../lib/seed'

export function ItemScreen({ id }: { id: string }) {
  const { t, lang } = useT()
  const { categories } = useStore()
  const [it, setIt] = useState<ItemWithImages | null | undefined>(undefined)
  const [cur, setCur] = useState(0)
  const [locPick, setLocPick] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { void fetchItem(id).then(setIt) }, [id])

  if (it === undefined) return <div className="empty"><Loader2 className="spin" size={28} /></div>
  if (!it) return <div className="empty"><p>{t('common.error')}</p></div>

  const imgs = (it.item_images ?? []).slice().sort((a, b) => a.sort - b.sort)
  const cat = catById(it.category_id)
  const patch = (p: Partial<ItemWithImages>) => { setIt(x => x ? { ...x, ...p } : x); setDirty(true) }

  async function save() {
    if (!it) return
    setSaving(true)
    try {
      await updateItem(it.id, { name: it.name, brand: it.brand, category_id: it.category_id, location_id: it.location_id, unit: it.unit, kind: it.kind, attrs: it.attrs, notes: it.notes, min_qty: it.min_qty, stage: 'ready' })
      setDirty(false); toast(t('item.saved'), 'ok')
    } catch (e) { toast(String((e as Error).message), 'err') } finally { setSaving(false) }
  }
  async function bump(d: number) {
    if (!it) return
    try { const n = await adjustQty(it.id, d); setIt(x => x ? { ...x, qty: n } : x) } catch (e) { toast(String((e as Error).message), 'err') }
  }
  async function archive() {
    if (!it) return
    await archiveItem(it); toast(t('item.archived'), 'ok'); navigate('/')
  }

  return (
    <section className="screen">
      <div className="screen-h">
        <button type="button" className="tz-btn quiet sm" onClick={() => history.length > 1 ? history.back() : navigate('/')}><ArrowRight size={16} style={{ transform: lang === 'en' ? 'rotate(180deg)' : undefined }} /> {t('item.back')}</button>
        <div className="row">
          <button type="button" className="tz-btn ghost sm" onClick={() => void archive()}><Archive size={16} /> {t('item.archive')}</button>
          <button type="button" className="tz-btn sm" disabled={!dirty || saving} onClick={() => void save()}>{saving ? <Loader2 size={16} className="spin" /> : t('item.save')}</button>
        </div>
      </div>
      <div className="item-hero">
        <div className="gallery">
          {imgs[cur] ? <img className="main" src={publicUrl('images', imgs[cur].path_original)} alt="" /> : <div className="main" style={{ aspectRatio: '1', borderRadius: 24, background: 'var(--surface2)' }} />}
          {imgs.length > 1 && <div className="thumbs">{imgs.map((im, i) => <img key={im.id} src={publicUrl('images', im.path_thumb || im.path_original)} alt="" className={i === cur ? 'on' : ''} onClick={() => setCur(i)} />)}</div>}
        </div>
        <div className="tz-card stack" style={{ gap: 14 }}>
          <div className="field"><label>{t('field.name')}</label><input className="tz-input" value={it.name ?? ''} onChange={e => patch({ name: e.target.value })} style={{ fontSize: 'var(--fs-h3)', fontWeight: 700 }} /></div>
          <div className="fields" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="field"><label>{t('field.brand')}</label><input className="tz-input" value={it.brand ?? ''} onChange={e => patch({ brand: e.target.value })} /></div>
            <div className="field"><label>{t('field.category')}</label>
              <select className="tz-input" value={it.category_id ?? ''} onChange={e => patch({ category_id: e.target.value || null })}>
                <option value="">{t('field.none')}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.parent_id ? '· ' : ''}{catName(c)}</option>)}
              </select>
            </div>
            <div className="field"><label>{t('field.location')}</label>
              <button type="button" className="tz-input" style={{ textAlign: 'start', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setLocPick(true)}>
                <i style={{ inlineSize: 10, blockSize: 10, borderRadius: '50%', background: locColor(it.location_id), flex: 'none' }} />
                <span className="grow">{locLabel(it.location_id) || t('field.choose')}</span>
              </button>
            </div>
            <div className="field"><label>{t('field.kind')}</label>
              <div className="seg">{(['equipment', 'consumable', 'kit'] as Kind[]).map(k => <button key={k} type="button" aria-pressed={it.kind === k} onClick={() => patch({ kind: k })}>{t(`kind.${k}` as Key)}</button>)}</div>
            </div>
            {(cat?.fields ?? []).map(f => (
              <div key={f.key} className="field"><label>{lang === 'he' ? f.label_he : f.label_en}{f.unit ? ` (${f.unit})` : ''}</label>
                {f.type === 'select' ? (
                  <select className="tz-input" value={String(it.attrs?.[f.key] ?? '')} onChange={e => patch({ attrs: { ...it.attrs, [f.key]: e.target.value || null } })}>
                    <option value="">{t('field.choose')}</option>{f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : <input className="tz-input" type={f.type === 'number' ? 'number' : 'text'} value={String(it.attrs?.[f.key] ?? '')} onChange={e => patch({ attrs: { ...it.attrs, [f.key]: f.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value } })} />}
              </div>
            ))}
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="field"><label>{t('field.qty')}</label>
              <div className="qty-ctl"><button type="button" onClick={() => void bump(-1)} aria-label="-1">−</button><input readOnly value={it.qty} /><button type="button" onClick={() => void bump(1)} aria-label="+1">+</button></div>
            </div>
            <div className="field"><label>{t('field.unit')}</label>
              <select className="tz-input" value={it.unit} onChange={e => patch({ unit: e.target.value })}>{UNITS.map(u => <option key={u} value={u}>{t(`unit.${u}` as Key)}</option>)}</select>
            </div>
            {it.kind === 'consumable' && <div className="field"><label>{t('stock.low')}</label><input className="tz-input" type="number" min={0} value={it.min_qty ?? ''} onChange={e => patch({ min_qty: e.target.value === '' ? null : Number(e.target.value) })} style={{ inlineSize: 100 }} /></div>}
          </div>
          <div className="field"><label>{t('field.notes')}</label><textarea className="tz-input" rows={2} value={it.notes ?? ''} onChange={e => patch({ notes: e.target.value })} /></div>
          {it.ai && (
            <details><summary className="meta" style={{ cursor: 'pointer' }}>{t('item.ai')}</summary>
              <dl className="kv" style={{ marginBlockStart: 8 }}>
                {Object.entries(it.ai).filter(([k, v]) => v != null && v !== '' && !['attrs', 'field_confidence', 'needs_reshoot'].includes(k)).map(([k, v]) => <><dt key={k + 'k'}>{k}</dt><dd key={k + 'v'} dir="auto">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></>)}
              </dl>
            </details>
          )}
        </div>
      </div>
      <LocationPicker open={locPick} onClose={() => setLocPick(false)} onPick={id => patch({ location_id: id })} />
    </section>
  )
}
