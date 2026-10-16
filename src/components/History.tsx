import { useEffect, useState } from 'react'
import { Camera, Check, MoveRight, Plus, Minus, Archive, Copy, Sparkles, Clock } from 'lucide-react'
import { useT, type Key } from '../i18n'
import { locLabel } from '../lib/store'
import { fetchActivity, type ActivityRow } from '../lib/api'

const ICON: Record<string, typeof Camera> = {
  create: Check, move: MoveRight, qty: Plus, archive: Archive, duplicate: Copy, clean: Sparkles, capture: Camera,
}

/** The item's timeline. Quiet by default: one line per event, newest first. */
export function History({ itemId, createdAt }: { itemId: string; createdAt?: string }) {
  const { t, lang } = useT()
  const [rows, setRows] = useState<ActivityRow[] | null>(null)
  useEffect(() => { void fetchActivity(itemId).then(setRows).catch(() => setRows([])) }, [itemId])
  if (!rows) return null

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const line = (r: ActivityRow) => {
    const d = (r.diff ?? {}) as Record<string, unknown>
    if (r.action === 'move') return t('hist.move', { from: locLabel(d.from as string) || t('hist.nowhere'), to: locLabel(d.to as string) || t('hist.nowhere') })
    if (r.action === 'qty') return t('hist.qty', { delta: Number(d.delta) > 0 ? `+${d.delta}` : String(d.delta), qty: String(d.qty) })
    return t(`hist.${r.action}` as Key)
  }

  return (
    <details className="tz-card history">
      <summary><Clock size={16} /> {t('hist.title')} <span className="meta">{rows.length}</span></summary>
      <ol>
        {rows.map(r => {
          const Icon = ICON[r.action] ?? (Number((r.diff as { delta?: number })?.delta) < 0 ? Minus : Clock)
          return (
            <li key={r.id}>
              <Icon size={15} aria-hidden="true" />
              <span className="grow">{line(r)}</span>
              <time className="meta mono" dateTime={r.created_at}>{fmt(r.created_at)}</time>
            </li>
          )
        })}
        {createdAt && (
          <li><Camera size={15} aria-hidden="true" /><span className="grow">{t('hist.captured')}</span><time className="meta mono" dateTime={createdAt}>{fmt(createdAt)}</time></li>
        )}
      </ol>
    </details>
  )
}
