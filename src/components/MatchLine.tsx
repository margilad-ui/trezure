import { Combine, MapPin, X, Loader2 } from 'lucide-react'
import { useT, type Key } from '../i18n'
import { locById, locLabel } from '../lib/store'
import { placesOf } from '../lib/api'
import type { ItemMatch, ItemWithImages } from '../lib/types'
import { Pic, coverImage } from './Pic'
import { Oki } from './Oki'

type Props = {
  match: ItemMatch
  twin: ItemWithImages
  /** the unit and place the new item has right now in its sort card */
  unit: string
  location: string | null
  busy?: boolean
  onSame: () => void
  onNear: () => void
  onDismiss: () => void
}

/**
 * OKI's one line in a sort card when something you already own looks like what you just shot.
 * It never asks during capture; it shows up here, once, and you decide with one tap.
 */
export function MatchLine({ match, twin, unit, location, busy, onSame, onNear, onDismiss }: Props) {
  const { t, lang } = useT()
  const same = match.verdict === 'same'
  const sameUnit = twin.unit === unit
  const twinPlace = twin.location_id
  const alreadyNear = Boolean(twinPlace && location === twinPlace)
  const reason = lang === 'he' ? match.reason_he : (match.reason_en ?? match.reason_he)
  const places = placesOf(twin)
  const where = places.slice(0, 2).map(p => `${locById(p.location_id)?.code ?? ''} · ${p.qty}`).join('  ·  ')
  const name = twin.name || t('remove.untitled')

  const sameBtn = sameUnit ? (
    <button type="button" className={`tz-btn sm ${same ? '' : 'quiet'}`} disabled={busy} onClick={onSame}>
      {busy ? <Loader2 size={16} className="spin" /> : <Combine size={16} />} {t('match.same.do')}
    </button>
  ) : null
  const nearBtn = (
    <button type="button" className={`tz-btn sm ${same ? 'quiet' : ''}`} disabled={busy} onClick={onNear}>
      <MapPin size={16} /> {alreadyNear || !twinPlace ? t('match.apart') : t('match.near', { code: locById(twinPlace)?.code ?? '' })}
    </button>
  )

  return (
    <div className={`match-line ${same ? 'same' : 'family'}`} role="group" aria-label={t('match.label')}>
      <div className="match-head">
        <Oki size={36} expression={same ? 'ok' : 'thinking'} pose="point" />
        <Pic size={56} image={coverImage(twin.item_images, twin.cover_image_id)} category={twin.category_id} />
        <div className="grow match-text">
          <p className="match-title">{same ? t('match.same', { name }) : t('match.family', { name })}</p>
          <p className="meta">{locLabel(twinPlace) || t('field.none')}{places.length ? `  ·  ${twin.qty} ${t(`unit.${twin.unit}` as Key)}` : ''}</p>
          {places.length > 1 && <p className="meta mono">{where}</p>}
          {reason && <p className="match-why">{reason}</p>}
          {!sameUnit && <p className="meta">{t('match.unit.diff')}</p>}
        </div>
      </div>
      <div className="match-actions">
        {same ? <>{sameBtn}{nearBtn}</> : <>{nearBtn}{sameBtn}</>}
        <button type="button" className="tz-btn ghost sm" disabled={busy} onClick={onDismiss}><X size={16} /> {t('match.no')}</button>
      </div>
    </div>
  )
}

/** The pair worth showing for one item: a confirmed "same" first, then "family", then the highest score. */
export function bestMatch(id: string, all: ItemMatch[], twins: Map<string, ItemWithImages>): ItemMatch | null {
  const mine = all.filter(m => (m.item_a === id || m.item_b === id) && (m.verdict === 'same' || m.verdict === 'family' || m.signals?.barcode === 'same'))
    .filter(m => { const o = twins.get(m.item_a === id ? m.item_b : m.item_a); return o && !o.archived_at })
  const rank = (m: ItemMatch) => (m.verdict === 'same' ? 2 : m.verdict === 'family' ? 1 : 0) * 10 + Number(m.score)
  return mine.sort((a, b) => rank(b) - rank(a))[0] ?? null
}
