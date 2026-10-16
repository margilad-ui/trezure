import { useEffect, useState } from 'react'
import { ArrowRight, Archive, Loader2, RefreshCw } from 'lucide-react'
import { useT, type Key } from '../i18n'
import { useStore, catById, locLabel, locColor } from '../lib/store'
import { fetchItem, updateItem, archiveItem, adjustQty, workspaceTags, setItemCategories, requestAnalysis } from '../lib/api'
import type { ItemWithImages, Kind, FieldDef } from '../lib/types'
import { publicUrl } from '../lib/supabase'
import { navigate } from '../lib/router'
import { LocationPicker } from '../components/LocationPicker'
import { TagInput } from '../components/TagInput'
import { CategoryField } from '../components/CategoryField'
import { toast } from '../components/Toast'
import { UNITS } from '../lib/seed'

export function ItemScreen({ id }: { id: string }) {
  const { t, lang } = useT()
  useStore()
  const [it, setIt] = useState<ItemWithImages | null | undefined>(undefined)
  const [cur, setCur] = useState(0)
  const [locPick, setLocPick] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [allTags, setAllTags] = useState<string[]>([])
  const [extra, setExtra] = useState<string[]>([])
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => { void fetchItem(id).then(v => { setIt(v); setExtra((v?.item_categories ?? []).map(x => x.category_id).filter(c => c !== v?.category_id)) }) }, [id])
  useEffect(() => { if (it) void workspaceTags(it.workspace_id).then(setAllTags).catch(() => {}) }, [it?.workspace_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (it === undefined) return <div className="empty"><Loader2 className="spin" size={28} /></div>
  if (!it) return <div className="empty"><p>{t('common.error')}</p></div>

  const imgs = (it.item_images ?? []).slice().sort((a, b) => a.sort - b.sort)
  const allFields = (() => {
    const seen = new Set<string>(); const out: FieldDef[] = []
    for (const cid of [it.category_id ?? '', ...extra]) {
      for (const f of catById(cid)?.fields ?? []) if (!seen.has(f.key)) { seen.add(f.key); out.push(f) }
    }
    return out
  })()
  const patch = (p: Partial<ItemWithImages>) => { setIt(x => x ? { ...x, ...p } : x); setDirty(true) }

  /** Sends the item back to OKI and waits for the answer, without touching what is already filled in. */
  async function reanalyze() {
    if (!it || analyzing) return
    setAnalyzing(true)
    const before = JSON.stringify(it.ai ?? null)
    try {
      await requestAnalysis(it)
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const fresh = await fetchItem(it.id)
        if (fresh && JSON.stringify(fresh.ai ?? null) !== before) {
          setIt(fresh)
          setExtra((fresh.item_categories ?? []).map(x => x.category_id).filter(c => c !== fresh.category_id))
          toast(fresh.ai?.tags?.length ? t('item.analyzed.tags', { n: fresh.ai.tags.length }) : t('item.analyzed'), 'ok')
          return
        }
      }
      toast(t('item.analyze.slow'))
    } catch (e) { toast(String((e as Error).message), 'err') } finally { setAnalyzing(false) }
  }

  async function save() {
    if (!it) return
    setSaving(true)
    try {
      await updateItem(it.id, { name: it.name, brand: it.brand, category_id: it.category_id, location_id: it.location_id, unit: it.unit, kind: it.kind, attrs: it.attrs, tags: it.tags, notes: it.notes, min_qty: it.min_qty, stage: 'ready' })
      await setItemCategories(it.id, it.workspace_id, extra)
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
          <button type="button" className="tz-btn quiet sm" disabled={analyzing} onClick={() => void reanalyze()} title={t('inbox.retry')}>
            {analyzing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} {t('inbox.retry')}
          </button>
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
            <CategoryField
              primary={it.category_id ?? ''}
              extra={extra}
              onPrimary={cid => patch({ category_id: cid || null })}
              onExtra={ids => { setExtra(ids); setDirty(true) }}
            />
            <div className="field"><label>{t('field.location')}</label>
              <button type="button" className="tz-input" style={{ textAlign: 'start', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setLocPick(true)}>
                <i style={{ inlineSize: 10, blockSize: 10, borderRadius: '50%', background: locColor(it.location_id), flex: 'none' }} />
                <span className="grow">{locLabel(it.location_id) || t('field.choose')}</span>
              </button>
            </div>
            <div className="field"><label>{t('field.kind')}</label>
              <div className="seg">{(['equipment', 'consumable', 'kit'] as Kind[]).map(k => <button key={k} type="button" aria-pressed={it.kind === k} onClick={() => patch({ kind: k })}>{t(`kind.${k}` as Key)}</button>)}</div>
            </div>
            {allFields.map(f => (
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
          <div className="field"><label>{t('field.tags')}</label>
            <TagInput value={it.tags ?? []} suggestions={allTags} proposed={it.ai?.tags ?? []} onChange={tags => patch({ tags })} />
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
