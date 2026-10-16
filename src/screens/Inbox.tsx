import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKey } from 'react'
import { Check, SkipForward, Trash2, RefreshCw } from 'lucide-react'
import { useT, dayLabel, timeLabel, type Key } from '../i18n'
import { useStore, catById, catName, locLabel, locColor } from '../lib/store'
import { fetchInbox, approveItem, archiveItem, updateItem, requestAnalysis, workspaceTags, setItemCategories } from '../lib/api'
import type { ItemWithImages, Category, Kind, FieldDef } from '../lib/types'
import { coverOf } from '../components/Pic'
import { Oki } from '../components/Oki'
import { LocationPicker } from '../components/LocationPicker'
import { TagInput } from '../components/TagInput'
import { CategoryField } from '../components/CategoryField'
import { toast } from '../components/Toast'
import { play } from '../lib/sound'
import { UNITS } from '../lib/seed'
import { href, onLink } from '../lib/router'
import { publicUrl } from '../lib/supabase'

type Draft = {
  name: string; brand: string; category_id: string; location_id: string
  qty: number; unit: string; kind: Kind; attrs: Record<string, string | number | null>
  tags: string[]
  extra_category_ids: string[]
}

function draftOf(it: ItemWithImages, cats: Category[]): Draft {
  const ai = it.ai ?? {}
  const conf = ai.confidence ?? 0
  const catId = it.category_id ?? (conf >= 0.5 && ai.category_id && cats.some(c => c.id === ai.category_id) ? ai.category_id : '')
  const cat = cats.find(c => c.id === catId)
  return {
    name: it.name ?? ai.name_he ?? ai.name_en ?? '',
    brand: it.brand ?? ai.brand ?? '',
    category_id: catId ?? '',
    location_id: it.location_id ?? '',
    qty: Number(it.qty ?? ai.qty_guess ?? 1) || 1,
    unit: it.unit && it.unit !== 'unit' ? it.unit : (ai.unit && (UNITS as readonly string[]).includes(ai.unit) ? ai.unit : cat?.default_unit ?? 'unit'),
    kind: (it.kind !== 'equipment' ? it.kind : cat?.default_kind ?? 'equipment') as Kind,
    attrs: { ...(ai.attrs ?? {}), ...(it.attrs ?? {}) },
    tags: it.tags?.length ? it.tags : [],
    extra_category_ids: (it.item_categories ?? []).map(x => x.category_id).filter(id => id !== catId),
  }
}

function jobState(it: ItemWithImages): 'none' | 'pending' | 'done' | 'error' | 'nokey' | 'reshoot' {
  const jobs = (it.image_jobs ?? []).filter(j => j.type === 'analyze').sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const j = jobs[0]
  if (!j) return it.ai ? 'done' : 'none'
  if (j.status === 'pending' || j.status === 'running') return 'pending'
  if (j.status === 'needs_reshoot') return 'reshoot'
  if (j.status === 'error') return j.error === 'no_key' ? 'nokey' : 'error'
  return 'done'
}

export function Inbox() {
  const { t, lang } = useT()
  const { workspace, categories, hasKey } = useStore()
  const [items, setItems] = useState<ItemWithImages[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [focus, setFocus] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState<string | null>(null)
  const [locPick, setLocPick] = useState<{ ids: string[] } | null>(null)
  const [doneCount, setDoneCount] = useState(0)
  const [knownTags, setKnownTags] = useState<string[]>([])
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const load = useCallback(async (quiet = false) => {
    if (!workspace) return
    if (!quiet) setLoading(true)
    try {
      const list = await fetchInbox(workspace.id)
      setItems(list)
      setDrafts(prev => {
        const next = { ...prev }
        for (const it of list) {
          // refresh the draft from AI if the user has not touched it yet
          if (!next[it.id] || (!next[it.id].name && it.ai)) next[it.id] = draftOf(it, categories)
        }
        return next
      })
      if (!focus && list.length) setFocus(list[0].id)
    } finally { setLoading(false) }
  }, [workspace, categories, focus])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (workspace) void workspaceTags(workspace.id).then(setKnownTags).catch(() => {}) }, [workspace])
  // poll while something is analyzing
  const anyPending = items.some(it => jobState(it) === 'pending')
  useEffect(() => {
    if (!anyPending) return
    const id = setInterval(() => void load(true), 3000)
    return () => clearInterval(id)
  }, [anyPending, load])

  const groups = useMemo(() => {
    const map = new Map<string, ItemWithImages[]>()
    for (const it of items) {
      const k = `${it.location_id ?? ''}|${new Date(it.created_at).toDateString()}`
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(it)
    }
    return Array.from(map.entries())
  }, [items])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const it of items) it.tags?.forEach(x => s.add(x))
    for (const d of Object.values(drafts)) d.tags?.forEach(x => s.add(x))
    knownTags.forEach(x => s.add(x))
    return Array.from(s).sort((a, b) => a.localeCompare(b, lang))
  }, [items, drafts, knownTags, lang])

  const order = items.map(i => i.id)
  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts(d => ({ ...d, [id]: { ...d[id], ...patch } }))

  function moveFocus(dir: 1 | -1) {
    const i = order.indexOf(focus ?? '')
    const next = order[Math.min(order.length - 1, Math.max(0, i + dir))]
    if (next) { setFocus(next); cardRefs.current[next]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); cardRefs.current[next]?.querySelector<HTMLInputElement>('input[data-first]')?.focus() }
  }

  async function approve(id: string) {
    const it = items.find(x => x.id === id); const d = drafts[id]
    if (!it || !d) return
    const remaining = items.filter(x => x.id !== id)
    setItems(remaining)
    const i = order.indexOf(id)
    const next = order[i + 1] ?? order[i - 1] ?? null
    setFocus(next)
    setTimeout(() => { if (next) cardRefs.current[next]?.querySelector<HTMLInputElement>('input[data-first]')?.focus() }, 30)
    try {
      await approveItem(it, {
        name: d.name.trim() || null, brand: d.brand.trim() || null,
        category_id: d.category_id || null, location_id: d.location_id || null,
        qty: d.qty, unit: d.unit, kind: d.kind, attrs: d.attrs, tags: d.tags,
      })
      await setItemCategories(it.id, it.workspace_id, d.extra_category_ids)
      play('sorted')
      setDoneCount(c => c + 1)
      if (remaining.length === 0) { play('complete'); toast(t('inbox.alldone', { n: doneCount + 1 }), 'ok', 3500) }
    } catch (e) {
      toast(String((e as Error).message || t('common.error')), 'err')
      void load(true)
    }
  }

  async function archive(id: string) {
    const it = items.find(x => x.id === id); if (!it) return
    setItems(list => list.filter(x => x.id !== id))
    try { await archiveItem(it) } catch { void load(true) }
  }

  async function retry(it: ItemWithImages) {
    try { await requestAnalysis(it); void load(true) } catch (e) { toast(String((e as Error).message), 'err') }
  }

  async function bulk(patch: Partial<Draft>) {
    const ids = Array.from(sel)
    setDrafts(d => { const n = { ...d }; ids.forEach(id => { n[id] = { ...n[id], ...patch } }); return n })
    // persist location and category immediately so grouping and filters stay true
    await Promise.all(ids.map(id => updateItem(id, {
      ...(patch.category_id !== undefined ? { category_id: patch.category_id || null } : {}),
      ...(patch.location_id !== undefined ? { location_id: patch.location_id || null } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    }).catch(() => {})))
    if (patch.location_id !== undefined) void load(true)
  }

  async function bulkRetry() {
    const ids = Array.from(sel)
    toast(t('inbox.retrying', { n: ids.length }))
    for (const id of ids) {
      const it = items.find(x => x.id === id)
      if (it) await retry(it).catch(() => {})
    }
    setSel(new Set())
  }

  async function bulkApprove() {
    const ids = Array.from(sel)
    setSel(new Set())
    for (const id of ids) await approve(id)
  }

  function onCardKey(e: RKey<HTMLDivElement>, id: string) {
    const tag = (e.target as HTMLElement).tagName
    if (e.key === 'Enter' && tag !== 'TEXTAREA' && !(tag === 'SELECT')) { e.preventDefault(); void approve(id) }
    else if (e.key === 'Escape') { e.preventDefault(); moveFocus(1) }
    else if (e.key === 'ArrowDown' && tag !== 'SELECT' && tag !== 'INPUT') { e.preventDefault(); moveFocus(1) }
    else if (e.key === 'ArrowUp' && tag !== 'SELECT' && tag !== 'INPUT') { e.preventDefault(); moveFocus(-1) }
    else if (e.key === '/' ) { e.preventDefault(); cardRefs.current[id]?.querySelector<HTMLSelectElement>('select[data-cat]')?.focus() }
  }

  if (!loading && items.length === 0) {
    return (
      <section className="screen">
        <div className="screen-h"><h1>{t('inbox.title')}</h1></div>
        <div className="empty">
          <Oki size={140} className="oki" expression={doneCount ? 'proud' : 'ok'} />
          <p style={{ fontSize: 'var(--fs-lead)', color: 'var(--ink)' }}>{doneCount ? t('inbox.alldone', { n: doneCount }) : t('inbox.empty')}</p>
          <a className="tz-btn" href={href('/capture')} onClick={onLink}>{t('nav.capture')}</a>
        </div>
      </section>
    )
  }

  return (
    <section className="screen">
      <div className="screen-h">
        <h1>{t('inbox.title')} <span className="dim" style={{ fontWeight: 400, fontSize: 'var(--fs-lead)' }}>{items.length}</span></h1>
        <div className="hint-keys">
          <span><span className="kbd">Enter</span> {t('inbox.keys.enter')}</span>
          <span><span className="kbd">Tab</span> {t('inbox.keys.tab')}</span>
          <span><span className="kbd">↑↓</span> {t('inbox.keys.arrows')}</span>
          <span><span className="kbd">Esc</span> {t('inbox.keys.esc')}</span>
        </div>
      </div>

      {!hasKey && (
        <div className="oki-line warn tz-card" style={{ marginBlockEnd: 12 }}>
          <Oki size={36} expression="unsure" /><p>{t('inbox.nokey')} <a href={href('/settings')} onClick={onLink} style={{ fontWeight: 700 }}>{t('nav.settings')}</a></p>
        </div>
      )}

      {sel.size > 0 && (
        <div className="bulkbar tz-card">
          <strong>{t('inbox.selected', { n: sel.size })}</strong>
          <select className="tz-input" style={{ inlineSize: 'auto', minBlockSize: 36 }} defaultValue="" onChange={e => { if (e.target.value) void bulk({ category_id: e.target.value }); e.target.value = '' }}>
            <option value="">{t('inbox.bulk.category')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.parent_id ? '· ' : ''}{catName(c)}</option>)}
          </select>
          <button type="button" className="tz-btn quiet sm" onClick={() => setLocPick({ ids: Array.from(sel) })}>{t('inbox.bulk.location')}</button>
          <input className="tz-input" style={{ inlineSize: 150, minBlockSize: 40 }} placeholder={t('inbox.bulk.tag')} aria-label={t('inbox.bulk.tag')}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              const tag = (e.target as HTMLInputElement).value.trim().replace(/^#+/, '')
              if (!tag) return
              setDrafts(d => { const n = { ...d }; sel.forEach(id => { const cur = n[id]?.tags ?? []; if (!cur.some(x => x.toLowerCase() === tag.toLowerCase())) n[id] = { ...n[id], tags: [...cur, tag] } }); return n })
              ;(e.target as HTMLInputElement).value = ''
            }} />
          <select className="tz-input" style={{ inlineSize: 'auto', minBlockSize: 36 }} defaultValue="" onChange={e => { if (e.target.value) void bulk({ kind: e.target.value as Kind }); e.target.value = '' }}>
            <option value="">{t('inbox.bulk.kind')}</option>
            {(['equipment', 'consumable', 'kit'] as Kind[]).map(k => <option key={k} value={k}>{t(`kind.${k}` as Key)}</option>)}
          </select>
          <span className="grow" />
          <button type="button" className="tz-btn quiet sm" onClick={() => void bulkRetry()}><RefreshCw size={16} /> {t('inbox.bulk.retry')}</button>
          <button type="button" className="tz-btn ghost sm" onClick={() => setSel(new Set())}>{t('inbox.clear')}</button>
          <button type="button" className="tz-btn sm" onClick={() => void bulkApprove()}><Check size={16} /> {t('inbox.bulk.approve')}</button>
        </div>
      )}

      {groups.map(([key, list]) => {
        const first = list[0]
        return (
          <div key={key}>
            <div className="group-h">
              <span className="tz-loc" style={{ ['--c' as string]: locColor(first.location_id) }}><i aria-hidden="true" /><strong>{locLabel(first.location_id) || t('field.none')}</strong></span>
              <span>{dayLabel(first.created_at)} {timeLabel(first.created_at)}</span>
              <span>·</span>
              <span>{list.length === 1 ? t('inbox.item') : t('inbox.items', { n: list.length })}</span>
              <span className="grow" />
              <label className="row" style={{ cursor: 'pointer' }}><input type="checkbox" className="check" checked={list.every(i => sel.has(i.id))} onChange={e => setSel(s => { const n = new Set(s); list.forEach(i => e.target.checked ? n.add(i.id) : n.delete(i.id)); return n })} /> {t('inbox.selectall')}</label>
            </div>
            <div className="stack">
              {list.map(it => {
                const d = drafts[it.id] ?? draftOf(it, categories)
                const fields: FieldDef[] = (() => {
                  const seen = new Set<string>(); const out: FieldDef[] = []
                  for (const id of [d.category_id, ...d.extra_category_ids]) {
                    for (const f of catById(id)?.fields ?? []) if (!seen.has(f.key)) { seen.add(f.key); out.push(f) }
                  }
                  return out
                })()
                const st = jobState(it)
                const ai = it.ai ?? {}
                const conf = ai.confidence ?? 0
                const fc = ai.field_confidence ?? {}
                const low = (k: string) => st === 'done' && !it.name && ((fc[k] ?? conf) < 0.6)
                const cover = coverOf(it.item_images, it.cover_image_id)
                const full = it.item_images?.length ? publicUrl('images', it.item_images.slice().sort((a, b) => a.sort - b.sort)[0].path_original) : ''
                let okiText: string | null = null
                if (st === 'pending') okiText = t('inbox.analyzing')
                else if (st === 'nokey') okiText = null
                else if (st === 'error') okiText = t('inbox.error')
                else if (st === 'reshoot') okiText = ai.needs_reshoot?.[lang === 'he' ? 'reason_he' : 'reason_en'] || t('inbox.oki.reshoot')
                else if (st === 'done' && ai.name_he) okiText = ai.brand ? t('inbox.oki.suggest.brand', { name: lang === 'he' ? ai.name_he : ai.name_en ?? ai.name_he, brand: ai.brand }) : t('inbox.oki.suggest', { name: lang === 'he' ? ai.name_he : ai.name_en ?? ai.name_he })
                else if (st === 'done') okiText = t('inbox.oki.unsure')
                return (
                  <div key={it.id} ref={el => { cardRefs.current[it.id] = el }} className={`tz-card card-item ${focus === it.id ? 'focus' : ''}`} onKeyDown={e => onCardKey(e, it.id)} onFocusCapture={() => setFocus(it.id)}>
                    <div className="ci-head">
                      {cover ? <img className="pic" src={cover} alt="" onClick={() => setZoom(full)} /> : <div className="pic" />}
                      <div className="grow">
                        {okiText === null && (
                          <div className="oki-line">
                            <Oki size={36} expression="sleep" />
                            <p className="dim">{t('inbox.waiting')}</p>
                            <button type="button" className="icon" style={{ inlineSize: 44, blockSize: 44 }} title={t('inbox.retry')} onClick={() => void retry(it)} aria-label={t('inbox.retry')}><RefreshCw size={16} /></button>
                          </div>
                        )}
                        {okiText !== null && (
                          <div className={`oki-line ${st === 'reshoot' || st === 'error' ? 'warn' : ''}`}>
                            <Oki size={36} expression={st === 'pending' ? 'thinking' : st === 'reshoot' || st === 'error' ? 'unsure' : (st === 'done' && !ai.name_he) || low('name') ? 'unsure' : 'ok'} />
                            <p>{okiText}</p>
                            {st !== 'pending' && <button type="button" className="icon" style={{ inlineSize: 44, blockSize: 44 }} title={t('inbox.retry')} onClick={() => void retry(it)} aria-label={t('inbox.retry')}><RefreshCw size={16} /></button>}
                          </div>
                        )}
                        <label className="row" style={{ gap: 8, cursor: 'pointer', color: 'var(--dim)', fontSize: 'var(--fs-meta)', fontWeight: 600 }}>
                          <input type="checkbox" className="check" checked={sel.has(it.id)} onChange={e => setSel(s => { const n = new Set(s); e.target.checked ? n.add(it.id) : n.delete(it.id); return n })} />
                          {t('inbox.select')}
                        </label>
                      </div>
                    </div>
                    <div className="fields">
                      <div className={`field wide-2 ${low('name') ? 'low' : ''}`}><label>{t('field.name')}</label><input data-first className="tz-input" value={d.name} onChange={e => setDraft(it.id, { name: e.target.value })} /></div>
                      <div className={`field ${low('brand') ? 'low' : ''}`}><label>{t('field.brand')}</label><input className="tz-input" value={d.brand} onChange={e => setDraft(it.id, { brand: e.target.value })} /></div>
                      <CategoryField
                        primary={d.category_id}
                        extra={d.extra_category_ids}
                        onPrimary={id => { const c = catById(id); setDraft(it.id, { category_id: id, ...(c ? { unit: c.default_unit, kind: c.default_kind } : {}) }) }}
                        onExtra={ids => setDraft(it.id, { extra_category_ids: ids })}
                      />
                      <div className="field"><label>{t('field.location')}</label>
                        <button type="button" className="tz-input" style={{ textAlign: 'start', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setLocPick({ ids: [it.id] })}>
                          <i style={{ inlineSize: 10, blockSize: 10, borderRadius: '50%', background: locColor(d.location_id), flex: 'none' }} />
                          <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locLabel(d.location_id) || t('field.choose')}</span>
                        </button>
                      </div>
                      {fields.map(f => (
                        <div key={f.key} className={`field ${low(f.key) ? 'low' : ''}`}>
                          <label>{lang === 'he' ? f.label_he : f.label_en}{f.unit ? ` (${f.unit})` : ''}</label>
                          {f.type === 'select' ? (
                            <select className="tz-input" value={String(d.attrs[f.key] ?? '')} onChange={e => setDraft(it.id, { attrs: { ...d.attrs, [f.key]: e.target.value || null } })}>
                              <option value="">{t('field.choose')}</option>
                              {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                              {d.attrs[f.key] && !f.options?.includes(String(d.attrs[f.key])) && <option value={String(d.attrs[f.key])}>{String(d.attrs[f.key])}</option>}
                            </select>
                          ) : (
                            <input className="tz-input" type={f.type === 'number' ? 'number' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} value={String(d.attrs[f.key] ?? '')} onChange={e => setDraft(it.id, { attrs: { ...d.attrs, [f.key]: f.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value } })} />
                          )}
                        </div>
                      ))}
                      <div className="field wide">
                        <label htmlFor={`tags-${it.id}`}>{t('field.tags')}</label>
                        <TagInput id={`tags-${it.id}`} value={d.tags} suggestions={allTags} proposed={ai.tags ?? []} onChange={tags => setDraft(it.id, { tags })} />
                      </div>
                    </div>
                    <div className="card-actions">
                      <div className="ca-row">
                        <div className="qty-ctl">
                          <button type="button" onClick={() => setDraft(it.id, { qty: Math.max(0, d.qty - 1) })} aria-label="-1">&#8722;</button>
                          <input value={d.qty} inputMode="decimal" onChange={e => setDraft(it.id, { qty: Number(e.target.value) || 0 })} aria-label={t('field.qty')} />
                          <button type="button" onClick={() => setDraft(it.id, { qty: d.qty + 1 })} aria-label="+1">+</button>
                        </div>
                        <select className="tz-input unit" value={d.unit} onChange={e => setDraft(it.id, { unit: e.target.value })} aria-label={t('field.unit')}>
                          {UNITS.map(u => <option key={u} value={u}>{t(`unit.${u}` as Key)}</option>)}
                        </select>
                        <div className="seg">
                          {(['equipment', 'consumable'] as Kind[]).map(k => <button key={k} type="button" aria-pressed={d.kind === k} onClick={() => setDraft(it.id, { kind: k })}>{t(`kind.${k}` as Key)}</button>)}
                        </div>
                      </div>
                      <div className="ca-end">
                        <button type="button" className="icon" aria-label={t('inbox.archive')} title={t('inbox.archive')} onClick={() => void archive(it.id)} style={{ color: 'var(--danger)' }}><Trash2 size={18} /></button>
                        <button type="button" className="tz-btn ghost" onClick={() => moveFocus(1)}><SkipForward size={16} /> {t('inbox.skip')}</button>
                        <button type="button" className="tz-btn" onClick={() => void approve(it.id)}><Check size={18} /> {t('inbox.approve')}</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {zoom && <div className="zoom-bg" onClick={() => setZoom(null)} role="presentation"><img src={zoom} alt="" /></div>}
      <LocationPicker open={Boolean(locPick)} onClose={() => setLocPick(null)} allowCreate onPick={id => { if (!locPick) return; if (locPick.ids.length === 1) { setDraft(locPick.ids[0], { location_id: id }); void updateItem(locPick.ids[0], { location_id: id }).then(() => load(true)) } else { void bulk({ location_id: id }) } }} />
    </section>
  )
}
