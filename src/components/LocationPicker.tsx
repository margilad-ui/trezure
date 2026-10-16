import { useMemo, useState, type CSSProperties } from 'react'
import { Plus, Search } from 'lucide-react'
import { Sheet } from './Sheet'
import { useT } from '../i18n'
import { useStore, locColor, locLabel, refreshRefs } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { Location } from '../lib/types'

const LS_RECENT = 'tz.loc.recent'
export function recentLocations(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_RECENT) || '[]') } catch { return [] }
}
export function pushRecent(id: string) {
  const r = [id, ...recentLocations().filter(x => x !== id)].slice(0, 6)
  try { localStorage.setItem(LS_RECENT, JSON.stringify(r)) } catch { /* ignore */ }
}

type Props = { open: boolean; onClose: () => void; onPick: (id: string) => void; allowCreate?: boolean }
export function LocationPicker({ open, onClose, onPick, allowCreate = true }: Props) {
  const { t, lang } = useT()
  const { locations, workspace } = useStore()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState<string | null>(null) // parent id
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const recent = recentLocations().map(id => locations.find(l => l.id === id)).filter(Boolean) as Location[]
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? locations.filter(l => (locLabel(l.id) + ' ' + l.code).toLowerCase().includes(s)) : locations
    return list.slice().sort((a, b) => locLabel(a.id).localeCompare(locLabel(b.id), lang))
  }, [q, locations, lang])

  const pick = (id: string) => { pushRecent(id); onPick(id); onClose() }

  async function create() {
    if (!workspace || !newName.trim()) return
    setBusy(true)
    try {
      const parent = locations.find(l => l.id === creating)
      const siblings = locations.filter(l => l.parent_id === (creating ?? null))
      const n = siblings.length + 1
      const code = parent ? `${parent.code}-${String(n).padStart(2, '0')}` : newName.trim().slice(0, 2).toUpperCase()
      const kind = parent ? (parent.kind === 'site' ? 'room' : parent.kind === 'room' ? 'cabinet' : 'shelf') : 'site'
      const { data, error } = await supabase.from('locations').insert({
        workspace_id: workspace.id, parent_id: creating ?? null, kind, name: newName.trim(), code, sort: n, path: parent ? `${parent.path}/${code}` : code,
      }).select('id').single()
      if (error) throw error
      await refreshRefs()
      setNewName(''); setCreating(null)
      pick(data.id)
    } finally { setBusy(false) }
  }

  const Row = ({ l }: { l: Location }) => (
    <div className="row">
      <button type="button" className="list-row grow" onClick={() => pick(l.id)}>
        <span className="tz-loc" style={{ '--c': locColor(l.id) } as CSSProperties}><i aria-hidden="true" /><span className="mono" style={{ fontSize: 'var(--fs-label)' }}>{l.code}</span></span>
        <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locLabel(l.id)}</span>
      </button>
      {allowCreate && <button type="button" className="icon" style={{ inlineSize: 40, blockSize: 40 }} aria-label={t('common.ok')} onClick={() => { setCreating(l.id); setNewName('') }}><Plus size={18} /></button>}
    </div>
  )

  return (
    <Sheet open={open} onClose={onClose} title={t('capture.pickloc')}>
      {creating !== null ? (
        <div className="stack">
          <div className="meta">{creating ? locLabel(creating) : t('capture.all')}</div>
          <input className="tz-input" autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('field.name')} onKeyDown={e => { if (e.key === 'Enter') void create() }} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="tz-btn ghost" onClick={() => setCreating(null)}>{t('common.cancel')}</button>
            <button type="button" className="tz-btn" disabled={busy || !newName.trim()} onClick={() => void create()}>{t('common.ok')}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="search-bar"><Search size={20} /><input className="tz-input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('common.search')} /></div>
          {!q && recent.length > 0 && <>
            <div className="tz-label">{t('capture.recent')}</div>
            <div className="list">{recent.map(l => <Row key={l.id} l={l} />)}</div>
          </>}
          <div className="tz-label">{t('capture.all')}</div>
          <div className="list">{filtered.map(l => <Row key={l.id} l={l} />)}</div>
          {allowCreate && <button type="button" className="tz-btn quiet" onClick={() => { setCreating(''); setNewName('') }}><Plus size={18} /> {t('capture.all')}</button>}
        </>
      )}
    </Sheet>
  )
}
