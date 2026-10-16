import type { CSSProperties } from 'react'
import { locColor, locLabel, locById } from '../lib/store'

type Props = { id: string | null | undefined; onClick?: () => void; code?: boolean; className?: string; placeholder?: string }
export function LocChip({ id, onClick, code = true, className, placeholder }: Props) {
  const loc = locById(id)
  const style = { '--c': locColor(id) } as CSSProperties
  const label = loc ? locLabel(id) : (placeholder ?? '')
  const inner = <>
    <i aria-hidden="true" />
    {loc && code && <span className="mono" style={{ fontSize: 'var(--fs-label)', fontWeight: 700 }}>{loc.code}</span>}
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
  </>
  if (onClick) return <button type="button" className={`tz-loc ${className ?? ''}`} style={style} onClick={onClick}>{inner}</button>
  return <span className={`tz-loc ${className ?? ''}`} style={style}>{inner}</span>
}
