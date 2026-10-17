import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Combine, Star, Loader2, X } from 'lucide-react'
import { useT, type Key } from '../i18n'
import { useStore, locLabel } from '../lib/store'
import { scanWorkspaceMatches, fetchItems, requestMatch, mergeItems, unmergeItems, decideMatch, placesOf } from '../lib/api'
import type { ItemMatch, ItemWithImages } from '../lib/types'
import { Pic, coverImage } from '../components/Pic'
import { Oki } from '../components/Oki'
import { toast } from '../components/Toast'
import { navigate } from '../lib/router'
import { play } from '../lib/sound'

type Group = { key: string; ids: string[]; pairs: ItemMatch[]; family?: boolean }

/** Items linked by any open pair end up in one group (union find), so three copies show up as one decision. */
function groupPairs(pairs: ItemMatch[]): Group[] {
  const parent = new Map<string, string>()
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r }
  const add = (x: string) => { if (!parent.has(x)) parent.set(x, x) }
  for (const p of pairs) { add(p.item_a); add(p.item_b); parent.set(find(p.item_a), find(p.item_b)) }
  const groups = new Map<string, Group>()
  for (const p of pairs) {
    const r = find(p.item_a)
    if (!groups.has(r)) groups.set(r, { key: r, ids: [], pairs: [] })
    const g = groups.get(r)!
    g.pairs.push(p)
    for (const id of [p.item_a, p.item_b]) if (!g.ids.includes(id)) g.ids.push(id)
  }
  const strength = (g: Group) => (g.pairs.some(p => p.verdict === 'same' || p.signals?.barcode === 'same') ? 10 : 0) + Math.max(...g.pairs.map(p => Number(p.score)))
  return Array.from(groups.values()).sort((a, b) => strength(b) - strength(a))
}

const isSame = (p: ItemMatch) => p.verdict === 'same' || p.signals?.barcode === 'same'

/**
 * The one time cleanup of what was entered before OKI knew how to spot twins. Every group is one decision:
 * merge the ticked ones into the starred one, or tell OKI they are different and never see them together again.
 */
export function Duplicates() {
  const { t, lang } = useT()
  const { workspace } = useStore()
  const [pairs, setPairs] = useState<ItemMatch[] | null>(null)
  const [items, setItems] = useState<Map<string, ItemWithImages>>(new Map())
  const [keeper, setKeeper] = useState<Record<string, string>>({})
  const [included, setIncluded] = useState<Record<string, Record<string, boolean>>>({})
  const [judging, setJudging] = useState<{ done: number; total: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const judged = useRef<Set<string>>(new Set())

  const load = useCallback(async (rescan: boolean) => {
    if (!workspace) return
    const ps = await scanWorkspaceMatches(workspace.id, rescan)
    const ids = Array.from(new Set(ps.flatMap(p => [p.item_a, p.item_b])))
    const its = await fetchItems(ids)
    const live = new Map(its.filter(i => !i.archived_at && i.stage === 'ready').map(i => [i.id, i]))
    setItems(live)
    setPairs(ps.filter(p => live.has(p.item_a) && live.has(p.item_b)))
  }, [workspace])

  useEffect(() => { void load(true).catch(e => { toast(String((e as Error).message), 'err'); setPairs([]) }) }, [load])

  // pairs OKI has not looked at yet get looked at, one item at a time, while the screen is open
  useEffect(() => {
    if (!pairs) return
    // for each unjudged pair, ask from whichever side has not been asked yet
    const todo = Array.from(new Set(pairs.filter(p => !p.verdict && p.signals?.barcode !== 'same')
      .map(p => !judged.current.has(p.item_a) ? p.item_a : !judged.current.has(p.item_b) ? p.item_b : '').filter(Boolean)))
    if (!todo.length) return
    todo.forEach(id => judged.current.add(id))
    void (async () => {
      setJudging({ done: 0, total: todo.length })
      for (const [i, id] of todo.entries()) { await requestMatch(id); setJudging({ done: i + 1, total: todo.length }) }
      setJudging(null)
      await load(false)
    })()
  }, [pairs, load])

  // doubles (same, or not judged yet) and look-alikes are separate decisions, so they are separate groups
  const groups = useMemo(() => {
    const ps = pairs ?? []
    const dbl = groupPairs(ps.filter(p => p.verdict !== 'family'))
    const fam = groupPairs(ps.filter(p => p.verdict === 'family')).map(g => ({ ...g, key: 'f' + g.key, family: true }))
    return [...dbl, ...fam]
  }, [pairs])
  const firstFamily = groups.findIndex(g => g.family)

  const keeperOf = (g: Group) => keeper[g.key] ?? g.ids.slice().sort((a, b) => {
    const x = items.get(a), y = items.get(b)
    return Number(y?.qty ?? 0) - Number(x?.qty ?? 0) || (x?.created_at ?? '').localeCompare(y?.created_at ?? '')
  })[0]
  /** ticked by default: what OKI called the same as the keeper, in the same unit */
  const isIn = (g: Group, id: string) => {
    const k = keeperOf(g)
    if (id === k || items.get(id)?.unit !== items.get(k)?.unit) return false
    const set = included[g.key]
    if (set && id in set) return set[id]
    return g.pairs.some(p => isSame(p) && ((p.item_a === id && p.item_b === k) || (p.item_b === id && p.item_a === k)))
  }

  async function mergeGroup(g: Group) {
    const k = keeperOf(g)
    const from = g.ids.filter(id => isIn(g, id))
    if (!from.length) return
    setBusy(g.key)
    const done: string[] = []
    try {
      for (const id of from) { await mergeItems(id, k); done.push(id) }
      play('sorted')
      const undo = { label: t('undo'), run: () => { void (async () => { for (const id of done.slice().reverse()) await unmergeItems(id); await load(false) })().catch(e => toast(String((e as Error).message), 'err')) } }
      toast(t('dup.merged', { n: done.length, name: items.get(k)?.name || t('remove.untitled') }), 'ok', 6000, undo)
    } catch (e) { toast(String((e as Error).message), 'err') } finally { setBusy(null); await load(false) }
  }

  async function different(g: Group) {
    setBusy(g.key)
    const open = g.pairs.filter(p => !p.decision)
    try {
      for (const p of open) await decideMatch(p.item_a, p.item_b, 'dismissed')
      setPairs(ps => (ps ?? []).filter(p => !open.includes(p)))
      const undo = { label: t('undo'), run: () => { void (async () => { for (const p of open) await decideMatch(p.item_a, p.item_b, null); await load(false) })() } }
      toast(t('dup.apart'), 'ok', 6000, undo)
    } catch (e) { toast(String((e as Error).message), 'err') } finally { setBusy(null) }
  }

  if (pairs === null) {
    return <section className="screen"><div className="screen-h"><h1>{t('dup.title')}</h1></div><div className="empty"><Oki size={120} expression="thinking" pose="search" /><p>{t('dup.scanning')}</p></div></section>
  }

  return (
    <section className="screen">
      <div className="screen-h">
        <div className="stack" style={{ gap: 4 }}>
          <h1>{t('dup.title')} {groups.length > 0 && <span className="dim" style={{ fontWeight: 400, fontSize: 'var(--fs-lead)' }}>{groups.length}</span>}</h1>
          <p className="meta">{t('dup.sub')}</p>
        </div>
        {judging && <span className="meta row" style={{ gap: 6 }}><Loader2 size={15} className="spin" /> {t('dup.judging', { done: judging.done, total: judging.total })}</span>}
      </div>

      {groups.length === 0 && (
        <div className="empty"><Oki size={140} expression="proud" /><p style={{ fontSize: 'var(--fs-lead)', color: 'var(--ink)' }}>{t('dup.none')}</p></div>
      )}

      <div className="stack" style={{ gap: 14 }}>
        {groups.map((g, gi) => {
          const k = keeperOf(g)
          const anySame = g.pairs.some(isSame)
          const pending = g.pairs.some(p => !p.verdict && p.signals?.barcode !== 'same')
          const n = g.ids.filter(id => isIn(g, id)).length
          const reasons = g.pairs.filter(p => (lang === 'he' ? p.reason_he : p.reason_en ?? p.reason_he))
          return (
            <div key={g.key} className="stack" style={{ gap: 10 }}>
            {gi === firstFamily && <h2 className="loc-sub">{t('dup.family.h')}</h2>}
            <div className={`tz-card dup-group ${g.family ? 'family' : ''}`}>
              <div className="oki-line">
                <Oki size={36} expression={pending ? 'thinking' : anySame ? 'ok' : 'unsure'} />
                <p>{pending ? t('dup.g.pending') : g.family ? t('dup.g.family') : anySame ? t('dup.g.same') : t('dup.g.family')}</p>
              </div>
              <div className="dup-items">
                {g.ids.map(id => {
                  const it = items.get(id); if (!it) return null
                  const on = isIn(g, id)
                  const unitOff = id !== k && it.unit !== items.get(k)?.unit
                  return (
                    <div key={id} className={`dup-item ${id === k ? 'keep' : ''} ${on ? 'in' : ''}`}>
                      <button type="button" className="dup-pic" onClick={() => navigate(`/item/${id}`)} aria-label={it.name ?? ''}>
                        <Pic size={112} image={coverImage(it.item_images, it.cover_image_id)} category={it.category_id} />
                      </button>
                      <b className="dup-name">{it.name || t('remove.untitled')}</b>
                      <span className="meta dup-where">{placesOf(it).map(p => locLabel(p.location_id)).filter(Boolean).slice(0, 2).join(' · ') || t('field.none')}</span>
                      <span className="meta"><span className="mono">{it.qty}</span> {t(`unit.${it.unit}` as Key)}</span>
                      {id === k
                        ? <span className="dup-keep"><Star size={14} /> {t('dup.keep.on')}</span>
                        : <div className="dup-ctl">
                            <label className="row" style={{ gap: 6, cursor: unitOff ? 'default' : 'pointer' }}>
                              <input type="checkbox" className="check" disabled={unitOff} checked={on} onChange={e => setIncluded(x => ({ ...x, [g.key]: { ...(x[g.key] ?? {}), [id]: e.target.checked } }))} />
                              {unitOff ? t('dup.unit') : t('dup.include')}
                            </label>
                            <button type="button" className="tz-btn quiet sm" onClick={() => { setKeeper(x => ({ ...x, [g.key]: id })); setIncluded(x => ({ ...x, [g.key]: {} })) }}><Star size={14} /> {t('dup.keep')}</button>
                          </div>}
                    </div>
                  )
                })}
              </div>
              {reasons.length > 0 && (
                <ul className="dup-reasons">
                  {reasons.map(p => <li key={p.item_a + p.item_b}><span className="dim">{items.get(p.item_a)?.name} · {items.get(p.item_b)?.name}</span> {lang === 'he' ? p.reason_he : p.reason_en ?? p.reason_he}</li>)}
                </ul>
              )}
              <div className="dup-actions">
                <button type="button" className="tz-btn sm" disabled={!n || busy === g.key} onClick={() => void mergeGroup(g)}>
                  {busy === g.key ? <Loader2 size={16} className="spin" /> : <Combine size={16} />} {n ? t('dup.merge', { n, name: items.get(k)?.name || t('remove.untitled') }) : t('dup.merge.none')}
                </button>
                <button type="button" className="tz-btn ghost sm" disabled={busy === g.key} onClick={() => void different(g)}><X size={16} /> {g.family ? t('dup.family.ok') : t('dup.different')}</button>
              </div>
            </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
