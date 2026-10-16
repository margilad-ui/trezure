import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { X, Plus } from 'lucide-react'
import { useT } from '../i18n'

/**
 * Free tags. Type and press Enter or comma, or pick a suggestion.
 * `suggestions` are the tags already used in this workspace plus whatever OKI proposed.
 */
type Props = {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  proposed?: string[]
  id?: string
}

export function TagInput({ value, onChange, suggestions = [], proposed = [], id }: Props) {
  const { t } = useT()
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const norm = (s: string) => s.trim().replace(/^#+/, '').replace(/\s+/g, ' ')
  const add = (raw: string) => {
    const tag = norm(raw)
    if (!tag) return
    if (!value.some(v => v.toLowerCase() === tag.toLowerCase())) onChange([...value, tag])
    setDraft(''); setOpen(false)
  }
  const remove = (tag: string) => onChange(value.filter(v => v !== tag))

  const unusedProposed = useMemo(
    () => proposed.filter(p => !value.some(v => v.toLowerCase() === p.toLowerCase())),
    [proposed, value])

  const matches = useMemo(() => {
    const q = norm(draft).toLowerCase()
    if (!q) return []
    return suggestions
      .filter(s => s.toLowerCase().includes(q) && !value.some(v => v.toLowerCase() === s.toLowerCase()))
      .slice(0, 6)
  }, [draft, suggestions, value])

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      // Enter inside the tag box adds a tag, it must not approve the whole card
      e.preventDefault(); e.stopPropagation()
      add(matches[0] && norm(draft).length < matches[0].length ? matches[0] : draft)
    } else if (e.key === 'Backspace' && !draft && value.length) {
      e.preventDefault(); remove(value[value.length - 1])
    } else if (e.key === 'Escape' && open) {
      e.preventDefault(); e.stopPropagation(); setOpen(false)
    }
  }

  return (
    <div className="taginput">
      <div className="tags" onClick={() => inputRef.current?.focus()}>
        {value.map(tag => (
          <span key={tag} className="tag">
            <span>{tag}</span>
            <button type="button" aria-label={`${t('common.close')} ${tag}`} onClick={e => { e.stopPropagation(); remove(tag) }}><X size={14} /></button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          className="tag-field"
          value={draft}
          placeholder={value.length ? '' : t('tags.placeholder')}
          onChange={e => { setDraft(e.target.value); setOpen(true) }}
          onKeyDown={onKey}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          aria-label={t('field.tags')}
        />
      </div>
      {open && matches.length > 0 && (
        <div className="tag-menu">
          {matches.map(m => <button key={m} type="button" onMouseDown={e => e.preventDefault()} onClick={() => add(m)}>{m}</button>)}
        </div>
      )}
      {unusedProposed.length > 0 && (
        <div className="tag-proposed">
          {unusedProposed.map(p => (
            <button key={p} type="button" className="tag ghost" onClick={() => add(p)}>
              <Plus size={13} /><span>{p}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
