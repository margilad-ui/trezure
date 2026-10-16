import { useMemo, useState } from 'react'
import { Plus, X, Search, Loader2 } from 'lucide-react'
import { Sheet } from './Sheet'
import { useT } from '../i18n'
import { useStore, catById, catName, createCategory } from '../lib/store'
import { toast } from './Toast'
import { UNITS } from '../lib/seed'

/**
 * One primary category, which carries the item's default unit and kind, plus any
 * number of additional categories. Additional ones add their fields and make the
 * item findable from there, they do not change its defaults.
 */
type Props = {
  primary: string
  extra: string[]
  onPrimary: (id: string) => void
  onExtra: (ids: string[]) => void
}

export function CategoryField({ primary, extra, onPrimary, onExtra }: Props) {
  const { t } = useT()
  const [open, setOpen] = useState<null | 'primary' | 'extra'>(null)

  const chips = extra.filter(id => id !== primary)
  return (
    <>
      <div className="field cat-field">
        <label>{t('field.category')}</label>
        <button type="button" className="tz-input" style={{ textAlign: 'start' }} onClick={() => setOpen('primary')}>
          {primary ? catName(catById(primary)) : <span className="dim">{t('field.choose')}</span>}
        </button>
        <div className="tag-row cat-extra">
          {chips.map(id => (
            <span key={id} className="tag">
              <span>{catName(catById(id))}</span>
              <button type="button" aria-label={`${t('common.close')} ${catName(catById(id))}`} onClick={() => onExtra(chips.filter(x => x !== id))}><X size={14} /></button>
            </span>
          ))}
          <button type="button" className="tag ghost sm" onClick={() => setOpen('extra')}>
            <Plus size={13} /><span>{chips.length ? t('cat.add') : t('cat.also.add')}</span>
          </button>
        </div>
      </div>

      <CategorySheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === 'extra' ? t('cat.also') : t('field.category')}
        hide={open === 'extra' ? [primary, ...chips] : []}
        onPick={id => {
          if (open === 'extra') { if (!chips.includes(id) && id !== primary) onExtra([...chips, id]) }
          else onPrimary(id)
          setOpen(null)
        }}
      />
    </>
  )
}

type SheetProps = { open: boolean; onClose: () => void; onPick: (id: string) => void; title: string; hide?: string[] }

export function CategorySheet({ open, onClose, onPick, title, hide = [] }: SheetProps) {
  const { t, lang } = useT()
  const { categories, workspace } = useStore()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [unit, setUnit] = useState('unit')
  const [kind, setKind] = useState<'equipment' | 'consumable'>('equipment')

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return categories
      .filter(c => !hide.includes(c.id))
      .filter(c => !s || catName(c).toLowerCase().includes(s) || (c.name_en ?? '').toLowerCase().includes(s))
  }, [categories, q, hide])

  async function create() {
    if (!workspace || !name.trim()) return
    setBusy(true)
    try {
      const id = await createCategory({ workspace_id: workspace.id, name_he: name.trim(), parent_id: parent || null, default_unit: unit, default_kind: kind })
      setName(''); setParent(''); setCreating(false)
      onPick(id)
    } catch (e) { toast(String((e as Error).message), 'err') } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {creating ? (
        <div className="stack">
          <div className="field"><label>{t('cat.name')}</label><input className="tz-input" autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void create() }} /></div>
          <div className="field"><label>{t('cat.parent')}</label>
            <select className="tz-input" value={parent} onChange={e => setParent(e.target.value)}>
              <option value="">{t('cat.noparent')}</option>
              {categories.filter(c => !c.parent_id).map(c => <option key={c.id} value={c.id}>{catName(c)}</option>)}
            </select>
          </div>
          <div className="field"><label>{t('field.unit')}</label>
            <select className="tz-input" value={unit} onChange={e => setUnit(e.target.value)}>
              {UNITS.map(u => <option key={u} value={u}>{t(`unit.${u}` as never)}</option>)}
            </select>
          </div>
          <div className="field"><label>{t('field.kind')}</label>
            <div className="seg">
              {(['equipment', 'consumable'] as const).map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{t(`kind.${k}` as never)}</button>)}
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="tz-btn ghost" onClick={() => setCreating(false)}>{t('common.cancel')}</button>
            <button type="button" className="tz-btn" disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? <Loader2 size={18} className="spin" /> : t('cat.create')}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="search-bar"><Search size={20} /><input className="tz-input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('common.search')} /></div>
          <div className="list">
            {list.map(c => (
              <button key={c.id} type="button" className="list-row" onClick={() => onPick(c.id)}>
                <span className="grow">{c.parent_id ? <span className="dim">{catName(catById(c.parent_id))} · </span> : null}{catName(c)}</span>
                {c.name_en && lang === 'he' && <span className="meta en">{c.name_en}</span>}
              </button>
            ))}
          </div>
          <button type="button" className="tz-btn quiet" onClick={() => setCreating(true)}><Plus size={18} /> {t('cat.new')}</button>
        </>
      )}
    </Sheet>
  )
}
