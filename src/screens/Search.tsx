import { useEffect, useMemo, useRef, useState } from 'react'
import { Search as SearchIcon, LayoutGrid, List, Table2, Loader2 } from 'lucide-react'
import { useT, type Key } from '../i18n'
import { useStore, catById, catName, locLabel, locColor } from '../lib/store'
import { searchItems, adjustQty, inboxCount, type SearchFilters } from '../lib/api'
import type { ItemWithImages, Kind, StockState } from '../lib/types'
import { coverOf } from '../components/Pic'
import { Oki } from '../components/Oki'
import { href, onLink, navigate } from '../lib/router'
import { play } from '../lib/sound'

type View = 'list' | 'grid' | 'table'
const LS_VIEW = 'tz.search.view'

export function Search() {
  const { t, lang } = useT()
  const { workspace, categories, locations } = useStore()
  const [q, setQ] = useState('')
  const [f, setF] = useState<SearchFilters>({})
  const [items, setItems] = useState<ItemWithImages[] | null>(null)
  const [loading, setLoading] = useState(false)
  const wide = useMedia('(min-width: 900px)')
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem(LS_VIEW) as View) || (wide ? 'table' : 'list') } catch { return 'list' } })
  const [sort, setSort] = useState<{ k: keyof ItemWithImages | 'cat' | 'loc'; d: 1 | -1 }>({ k: 'updated_at', d: -1 })
  const timer = useRef<number | undefined>(undefined)
  const lastCount = useRef<number | null>(null)
  const [waiting, setWaiting] = useState(0)

  useEffect(() => { try { localStorage.setItem(LS_VIEW, view) } catch { /* ignore */ } }, [view])

  // how many items are still waiting in sort, so the home screen never looks empty by mistake
  useEffect(() => {
    if (!workspace) return
    void inboxCount(workspace.id).then(setWaiting).catch(() => {})
  }, [workspace, items])

  useEffect(() => {
    if (!workspace) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      setLoading(true)
      try {
        const res = await searchItems(workspace.id, { ...f, q })
        setItems(res)
        if (q.trim() && res.length === 1 && lastCount.current !== 1) play('found')
        lastCount.current = res.length
      } finally { setLoading(false) }
    }, q ? 150 : 0)
    return () => window.clearTimeout(timer.current)
  }, [q, f, workspace])

  const sorted = useMemo(() => {
    if (!items) return []
    const val = (it: ItemWithImages) => sort.k === 'cat' ? catName(catById(it.category_id)) : sort.k === 'loc' ? locLabel(it.location_id) : (it[sort.k] as string | number | null) ?? ''
    return items.slice().sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.d })
  }, [items, sort])

  async function bump(it: ItemWithImages, delta: number) {
    const prev = it.qty
    setItems(list => list?.map(x => x.id === it.id ? { ...x, qty: Math.max(0, x.qty + delta) } : x) ?? null)
    try { const n = await adjustQty(it.id, delta); setItems(list => list?.map(x => x.id === it.id ? { ...x, qty: n, stock_state: n === 0 ? 'empty' : x.min_qty != null && n <= x.min_qty ? 'low' : 'full' } : x) ?? null) }
    catch { setItems(list => list?.map(x => x.id === it.id ? { ...x, qty: prev } : x) ?? null) }
  }

  const chip = (label: string, on: boolean, onClick: () => void) => <button type="button" className="chip-btn" aria-pressed={on} onClick={onClick}>{label}</button>
  const noFilters = !q && !f.category_id && !f.location_id && !f.kind && !f.stock && !f.inbox
  const isEmptyWorkspace = items !== null && items.length === 0 && noFilters

  const stockBadge = (it: ItemWithImages) => it.stage === 'inbox' ? <span className="badge-stock inbox">{t('stage.inbox')}</span> : it.stock_state !== 'full' ? <span className={`badge-stock ${it.stock_state}`}>{t(`stock.${it.stock_state}` as Key)}</span> : null

  return (
    <section className="screen">
      <div className="search-bar">
        <SearchIcon size={22} />
        <input className="tz-input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('search.placeholder')} autoFocus={wide} enterKeyHint="search" aria-label={t('search.title')} />
      </div>
      <div className="chips" style={{ marginBlockStart: 10 }}>
        <select className="chip-btn" value={f.category_id ?? ''} onChange={e => setF(x => ({ ...x, category_id: e.target.value || null }))} aria-label={t('search.filter.category')} style={{ appearance: 'auto' }}>
          <option value="">{t('search.filter.category')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.parent_id ? '· ' : ''}{catName(c)}</option>)}
        </select>
        <select className="chip-btn" value={f.location_id ?? ''} onChange={e => setF(x => ({ ...x, location_id: e.target.value || null }))} aria-label={t('search.filter.location')} style={{ appearance: 'auto' }}>
          <option value="">{t('search.filter.location')}</option>
          {locations.map(l => <option key={l.id} value={l.id}>{locLabel(l.id)}</option>)}
        </select>
        {(['equipment', 'consumable'] as Kind[]).map(k => chip(t(`kind.${k}` as Key), f.kind === k, () => setF(x => ({ ...x, kind: x.kind === k ? null : k }))))}
        {(['low', 'empty'] as StockState[]).map(s => chip(t(`stock.${s}` as Key), f.stock === s, () => setF(x => ({ ...x, stock: x.stock === s ? null : s }))))}
        {chip(waiting > 0 ? `${t('search.inbox')} ${waiting}` : t('search.inbox'), Boolean(f.inbox), () => setF(x => ({ ...x, inbox: !x.inbox })))}
        <span className="grow" />
        <div className="seg" style={{ flex: 'none' }}>
          <button type="button" aria-pressed={view === 'list'} aria-label={t('search.view.list')} onClick={() => setView('list')} style={{ padding: '0 10px' }}><List size={18} /></button>
          <button type="button" aria-pressed={view === 'grid'} aria-label={t('search.view.grid')} onClick={() => setView('grid')} style={{ padding: '0 10px' }}><LayoutGrid size={18} /></button>
          {wide && <button type="button" aria-pressed={view === 'table'} aria-label={t('search.view.table')} onClick={() => setView('table')} style={{ padding: '0 10px' }}><Table2 size={18} /></button>}
        </div>
      </div>

      {items === null ? <div className="empty"><Loader2 className="spin" size={28} /></div> :
        isEmptyWorkspace ? (
          <div className="empty">
            <Oki size={140} className="oki" />
            <p style={{ fontSize: 'var(--fs-lead)', color: 'var(--ink)' }}>
              {waiting > 0 ? (waiting === 1 ? t('search.waiting.one') : t('search.waiting', { n: waiting })) : t('search.empty')}
            </p>
            <div className="row" style={{ gap: 10 }}>
              {waiting > 0 && <a className="tz-btn" href={href('/inbox')} onClick={onLink}>{t('search.gosort')}</a>}
              <a className={`tz-btn ${waiting > 0 ? 'ghost' : ''}`} href={href('/capture')} onClick={onLink}>{t('nav.capture')}</a>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="empty"><Oki size={120} className="oki" /><p>{t('search.noresults')}</p></div>
        ) : (
          <>
            <p className="meta" style={{ marginBlockStart: 10 }}>{items.length === 1 ? t('search.result') : t('search.results', { n: items.length })}{loading && <Loader2 size={14} className="spin" style={{ marginInlineStart: 8, verticalAlign: 'middle' }} />}</p>
            {view === 'grid' && (
              <div className="grid-view">
                {sorted.map(it => (
                  <button key={it.id} type="button" className="grid-card" onClick={() => navigate(`/item/${it.id}`)}>
                    {coverOf(it.item_images, it.cover_image_id) ? <img src={coverOf(it.item_images, it.cover_image_id)} alt="" loading="lazy" /> : <div style={{ aspectRatio: '1', background: 'var(--surface2)' }} />}
                    <div className="b">
                      <span className="name">{it.name || <span className="dim">{t('stage.inbox')}</span>}</span>
                      <span className="row" style={{ justifyContent: 'space-between' }}><span className="mono" style={{ fontSize: 'var(--fs-sm)' }}>{it.qty}</span>{stockBadge(it)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {view === 'list' && (
              <div className="results">
                {sorted.map(it => (
                  <div key={it.id} className="res-row" role="button" tabIndex={0} onClick={() => navigate(`/item/${it.id}`)} onKeyDown={e => { if (e.key === 'Enter') navigate(`/item/${it.id}`) }}>
                    {coverOf(it.item_images, it.cover_image_id) ? <img src={coverOf(it.item_images, it.cover_image_id)} alt="" loading="lazy" /> : <div style={{ inlineSize: 64, blockSize: 64, borderRadius: 12, background: 'var(--surface2)' }} />}
                    <div className="grow">
                      <div className="name">{it.name || <span className="dim">{t('stage.inbox')}</span>}{it.brand && <span className="dim" style={{ fontWeight: 400 }}> · {it.brand}</span>}</div>
                      <div className="sub">
                        {it.location_id && <span className="tz-loc" style={{ ['--c' as string]: locColor(it.location_id), fontSize: 'var(--fs-label)', padding: '2px 8px' }}><i aria-hidden="true" />{locLabel(it.location_id)}</span>}
                        {it.category_id && <span className="meta">{catName(catById(it.category_id))}</span>}
                        {stockBadge(it)}
                      </div>
                    </div>
                    <div className="qty-ctl" onClick={e => e.stopPropagation()}>
                      <button type="button" onClick={() => void bump(it, -1)} aria-label="-1">−</button>
                      <span className="qty" style={{ alignSelf: 'center' }}>{it.qty}</span>
                      <button type="button" onClick={() => void bump(it, +1)} aria-label="+1">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {view === 'table' && wide && (
              <table className="tbl">
                <thead><tr>
                  <th></th>
                  {([['name', t('field.name')], ['brand', t('field.brand')], ['cat', t('field.category')], ['loc', t('field.location')], ['qty', t('field.qty')], ['stock_state', t('field.stock')], ['updated_at', t('field.updated')]] as [typeof sort.k, string][]).map(([k, label]) => (
                    <th key={k} onClick={() => setSort(s => ({ k, d: s.k === k ? (s.d === 1 ? -1 : 1) : 1 }))} aria-sort={sort.k === k ? (sort.d === 1 ? 'ascending' : 'descending') : 'none'}>{label}{sort.k === k ? (sort.d === 1 ? ' ↑' : ' ↓') : ''}</th>
                  ))}
                  <th></th>
                </tr></thead>
                <tbody>
                  {sorted.map(it => (
                    <tr key={it.id} className="rowbtn" onClick={() => navigate(`/item/${it.id}`)}>
                      <td>{coverOf(it.item_images, it.cover_image_id) ? <img src={coverOf(it.item_images, it.cover_image_id)} alt="" loading="lazy" /> : <div style={{ inlineSize: 48, blockSize: 48, borderRadius: 8, background: 'var(--surface2)' }} />}</td>
                      <td style={{ fontWeight: 700 }}>{it.name || <span className="dim">{t('stage.inbox')}</span>}</td>
                      <td>{it.brand}</td>
                      <td>{catName(catById(it.category_id))}</td>
                      <td>{it.location_id && <span className="tz-loc" style={{ ['--c' as string]: locColor(it.location_id) }}><i aria-hidden="true" />{locLabel(it.location_id)}</span>}</td>
                      <td className="mono">{it.qty} <span className="dim" style={{ fontFamily: 'var(--font-he)', fontWeight: 400 }}>{t(`unit.${it.unit}` as Key)}</span></td>
                      <td>{stockBadge(it) ?? <span className="meta">{t('stock.full')}</span>}</td>
                      <td className="meta">{new Date(it.updated_at).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB')}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="qty-ctl"><button type="button" onClick={() => void bump(it, -1)} aria-label="-1">−</button><button type="button" onClick={() => void bump(it, +1)} aria-label="+1">+</button></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
    </section>
  )
}

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return m
}
