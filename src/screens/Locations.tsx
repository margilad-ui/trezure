import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Plus, Camera, Loader2, Package, MapPin, Pencil, Check, X, Tag } from 'lucide-react'
import { useT, type Key } from '../i18n'
import { useStore, locById, refreshRefs } from '../lib/store'
import { locationCounts, createLocation, updateLocation, uploadLocationPhoto, searchItems } from '../lib/api'
import { squareFromFile } from '../lib/image'
import { publicUrl } from '../lib/supabase'
import { href, onLink, navigate } from '../lib/router'
import { Sheet } from '../components/Sheet'
import { Pic, coverImage } from '../components/Pic'
import { Oki } from '../components/Oki'
import { LabelSheet } from '../components/LabelSheet'
import { labelUrl } from '../lib/label'
import { toast } from '../components/Toast'
import type { ItemWithImages, Location } from '../lib/types'

const KINDS = ['site', 'room', 'cabinet', 'shelf', 'box', 'drawer', 'other'] as const
/** What you most likely create inside a given kind, so the picker opens on the right one. */
const CHILD_OF: Record<string, string> = { site: 'room', room: 'cabinet', cabinet: 'shelf', shelf: 'box', box: 'box', drawer: 'box', other: 'other' }

/**
 * Locations: a tree you can walk into. One screen per level on a phone, the same screen with more
 * breathing room on a desktop. Every branch shows how much is inside it, counting everything below.
 */
export function Locations({ id }: { id?: string }) {
  const { t, lang } = useT()
  const { locations, workspace } = useStore()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [items, setItems] = useState<ItemWithImages[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<string>('room')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<{ name: string; kind: string; color: string }>({ name: '', kind: 'room', color: '' })
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [labelling, setLabelling] = useState(false)

  const here = id ? locById(id) : undefined
  const children = useMemo(
    () => locations.filter(l => (l.parent_id ?? null) === (id ?? null)).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, lang)),
    [locations, id, lang],
  )

  useEffect(() => { if (workspace) void locationCounts(workspace.id).then(setCounts).catch(() => {}) }, [workspace])
  useEffect(() => {
    if (!workspace || !id) { setItems(null); return }
    setItems(null)
    void searchItems(workspace.id, { location_id: id }).then(setItems).catch(() => setItems([]))
  }, [workspace, id])
  useEffect(() => { if (here) setDraft({ name: here.name, kind: here.kind, color: here.color ?? '' }) }, [here?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Items in this branch and everything under it. */
  const deepCount = useMemo(() => {
    const kids: Record<string, string[]> = {}
    for (const l of locations) { const k = l.parent_id ?? '_'; (kids[k] ??= []).push(l.id) }
    const memo: Record<string, number> = {}
    const walk = (locId: string): number => {
      if (memo[locId] != null) return memo[locId]
      let n = counts[locId] ?? 0
      for (const c of kids[locId] ?? []) n += walk(c)
      memo[locId] = n
      return n
    }
    return walk
  }, [locations, counts])

  const trail: Location[] = []
  { let p = here; while (p) { trail.unshift(p); p = p.parent_id ? locById(p.parent_id) : undefined } }

  async function add() {
    if (!workspace || !newName.trim()) return
    setBusy(true)
    try {
      await createLocation(workspace.id, id ?? null, newName.trim(), newKind, here?.code, children.length)
      await refreshRefs()
      setNewName(''); setAdding(false)
    } catch (e) { toast(String((e as Error).message), 'err') } finally { setBusy(false) }
  }
  async function saveEdit() {
    if (!here) return
    setBusy(true)
    try {
      await updateLocation(here.id, { name: draft.name.trim() || here.name, kind: draft.kind, color: draft.color || null })
      await refreshRefs(); setEditing(false); toast(t('settings.saved'), 'ok')
    } catch (e) { toast(String((e as Error).message), 'err') } finally { setBusy(false) }
  }
  async function onPhoto(file: File) {
    if (!workspace || !here) return
    setUploading(true)
    try {
      const shot = await squareFromFile(file)
      await uploadLocationPhoto(workspace.id, here.id, shot.blob)
      await refreshRefs(); toast(t('loc.photo.saved'), 'ok')
    } catch (e) { toast(String((e as Error).message), 'err') } finally { setUploading(false) }
  }

  const color = here?.color || (here ? undefined : undefined)
  return (
    <section className="screen">
      <div className="screen-h">
        <div className="stack" style={{ gap: 4 }}>
          <h1>{here ? here.name : t('loc.title')}</h1>
          {trail.length > 0 && (
            <nav className="crumbs" aria-label={t('loc.title')}>
              <a href={href('/locations')} onClick={onLink}>{t('loc.all')}</a>
              {trail.map((l, i) => (
                <span key={l.id}>
                  <ChevronLeft size={13} style={{ transform: lang === 'en' ? 'rotate(180deg)' : undefined }} />
                  {i === trail.length - 1 ? <b>{l.name}</b> : <a href={href(`/loc/${l.id}`)} onClick={onLink}>{l.name}</a>}
                </span>
              ))}
            </nav>
          )}
        </div>
        <div className="row">
          {here && <button type="button" className="tz-btn quiet sm" onClick={() => setLabelling(true)}><Tag size={15} /> {t('loc.label')}</button>}
          {here && <button type="button" className="tz-btn quiet sm" onClick={() => setEditing(e => !e)}><Pencil size={15} /> {t('loc.edit')}</button>}
          <button type="button" className="tz-btn sm" onClick={() => { setNewKind(CHILD_OF[here?.kind ?? 'site'] ?? 'room'); setAdding(true) }}><Plus size={16} /> {here ? t('loc.addChild') : t('loc.addSite')}</button>
        </div>
      </div>

      {here && (
        <div className="loc-head tz-card">
          <button type="button" className="loc-photo" onClick={() => fileRef.current?.click()} title={t('loc.photo')} style={{ ['--c' as string]: here.color || 'var(--teal)' }}>
            {uploading ? <Loader2 className="spin" size={22} />
              : here.photo_path ? <img src={publicUrl('images', here.photo_path)} alt="" />
              : <><Camera size={22} /><span className="meta">{t('loc.photo')}</span></>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void onPhoto(f); e.target.value = '' }} />
          <div className="stack" style={{ gap: 6 }}>
            <span className="tz-loc" style={{ ['--c' as string]: here.color || 'var(--teal)' }}><i aria-hidden="true" /><span className="mono">{here.code}</span></span>
            <span className="meta">{t(`loc.kind.${here.kind}` as Key)} · {(n => n === 0 ? t('loc.count.zero') : n === 1 ? t('loc.count.one') : t('loc.count', { n }))(deepCount(here.id))}</span>
          </div>
        </div>
      )}

      {editing && here && (
        <div className="tz-card stack" style={{ gap: 10, marginBlockEnd: 12 }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="field"><label className="tz-label">{t('loc.name')}</label><input className="tz-input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></div>
            <div className="field"><label className="tz-label">{t('loc.kind')}</label>
              <select className="tz-input" value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))}>{KINDS.map(k => <option key={k} value={k}>{t(`loc.kind.${k}` as Key)}</option>)}</select>
            </div>
            <div className="field"><label className="tz-label">{t('loc.color')}</label>
              <input className="tz-input" type="color" value={draft.color || '#1EA5A0'} onChange={e => setDraft(d => ({ ...d, color: e.target.value }))} style={{ inlineSize: 64, padding: 4 }} />
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="tz-btn sm" disabled={busy} onClick={() => void saveEdit()}><Check size={15} /> {t('item.save')}</button>
            <button type="button" className="tz-btn ghost sm" onClick={() => setEditing(false)}><X size={15} /> {t('common.cancel')}</button>
          </div>
        </div>
      )}

      {children.length > 0 && (
        <div className="loc-grid">
          {children.map(l => (
            <a key={l.id} className="loc-card" href={href(`/loc/${l.id}`)} onClick={onLink} style={{ ['--c' as string]: l.color || here?.color || 'var(--teal)' }}>
              {l.photo_path ? <img className="loc-card-pic" src={publicUrl('images', l.photo_path)} alt="" /> : <span className="loc-card-pic ph"><MapPin size={20} /></span>}
              <span className="grow">
                <b>{l.name}</b>
                <span className="meta mono">{l.code}</span>
              </span>
              <span className="loc-n">{deepCount(l.id)}</span>
              <ChevronLeft className="dim" size={18} style={{ transform: lang === 'en' ? 'rotate(180deg)' : undefined }} />
            </a>
          ))}
        </div>
      )}

      {here && (
        items === null ? <div className="empty"><Loader2 className="spin" size={24} /></div>
        : items.length > 0 ? (
          <>
            <h2 className="loc-sub">{items.length === 1 ? t('loc.here.one') : t('loc.here', { n: items.length })}</h2>
            <div className="grid-view">
              {items.map(it => (
                <button key={it.id} type="button" className="grid-card" onClick={() => navigate(`/item/${it.id}`)}>
                  <Pic className="gpic" image={coverImage(it.item_images, it.cover_image_id)} category={it.category_id} />
                  <div className="b"><span className="name">{it.name || t('stage.inbox')}</span><span className="mono" style={{ fontSize: 'var(--fs-sm)' }}>{it.qty}</span></div>
                </button>
              ))}
            </div>
          </>
        ) : children.length === 0 ? (
          <div className="empty"><Oki size={120} expression="ok" /><p>{t('loc.empty')}</p><a className="tz-btn" href={href('/capture')} onClick={onLink}>{t('nav.capture')}</a></div>
        ) : null
      )}

      {!here && children.length === 0 && <div className="empty"><Oki size={120} /><p>{t('loc.empty.root')}</p></div>}

      <LabelSheet open={labelling} onClose={() => setLabelling(false)} kind="location"
        data={here ? { name: here.name, code: here.code, url: labelUrl('location', here.code), parent: here.parent_id ? (locById(here.parent_id)?.name ?? '') : '' } : null} />
      <Sheet open={adding} onClose={() => setAdding(false)} title={here ? t('loc.addChild.in', { name: here.name }) : t('loc.addSite')}>
        <label className="tz-label" htmlFor="locname">{t('loc.name')}</label>
        <input id="locname" className="tz-input" value={newName} autoFocus onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void add() }} />
        <label className="tz-label" htmlFor="lockind">{t('loc.kind')}</label>
        <select id="lockind" className="tz-input" value={newKind} onChange={e => setNewKind(e.target.value)}>{KINDS.filter(k => here || k === 'site').map(k => <option key={k} value={k}>{t(`loc.kind.${k}` as Key)}</option>)}</select>
        <button type="button" className="tz-btn" disabled={busy || !newName.trim()} onClick={() => void add()}>{busy ? <Loader2 className="spin" size={18} /> : <Plus size={18} />} {t('loc.create')}</button>
      </Sheet>
      {color === undefined && <Package size={0} aria-hidden="true" />}
    </section>
  )
}

/**
 * Lands here from a scanned label: /l/<code>. Resolves the code to its place, or says plainly that this
 * label does not belong to anything here, which is what a label from someone else's shelf would do.
 */
export function LocationByCode({ code }: { code: string }) {
  const { t } = useT()
  const { locations } = useStore()
  const match = locations.find(l => l.code?.toLowerCase() === code.toLowerCase())
  useEffect(() => { if (match) navigate(`/loc/${match.id}`, true) }, [match])
  if (match) return null
  if (!locations.length) return <div className="empty"><Loader2 className="spin" size={24} /></div>
  return (
    <section className="screen">
      <div className="empty">
        <Oki size={130} expression="unsure" pose="search" />
        <p>{t('loc.badcode', { code })}</p>
        <a className="tz-btn" href={href('/locations')} onClick={onLink}>{t('loc.all')}</a>
      </div>
    </section>
  )
}
