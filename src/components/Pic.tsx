import { useCallback, useState, type CSSProperties } from 'react'
import { publicUrl } from '../lib/supabase'
import { catColor } from '../lib/store'
import type { ItemImage } from '../lib/types'

/** Cover image record for an item: the cover if set, else the first by sort. */
export function coverImage(images: ItemImage[] | undefined, coverId?: string | null): ItemImage | undefined {
  if (!images?.length) return undefined
  const sorted = images.slice().sort((a, b) => a.sort - b.sort)
  return sorted.find(i => i.id === coverId) ?? sorted[0]
}

/** Cover URL for an item. Thumb when we have one, else the original. (Sprint 1 API, still used for zoom.) */
export function coverOf(images: ItemImage[] | undefined, coverId?: string | null, thumb = true): string {
  const img = coverImage(images, coverId)
  if (!img) return ''
  return publicUrl('images', (thumb && img.path_thumb) || img.path_original)
}

type Props = {
  /** the image record; when it has a clean cutout the composed view is used */
  image?: ItemImage | null
  /** plain URL fallback (no cutout logic) */
  src?: string
  /** explicit cutout URL (demos); normally derived from image.path_clean */
  srcClean?: string
  /** primary category id, picks the backdrop tint */
  category?: string | null
  /** 'clean' composes cutout on a tint with a contact shadow; 'raw' always shows the original */
  mode?: 'clean' | 'raw'
  /** prefer the thumb for the original (lists); the cutout is always the full PNG */
  thumb?: boolean
  alt?: string
  className?: string
  onClick?: () => void
  size?: number
  style?: CSSProperties
}

/**
 * Item picture. With a clean cutout: the transparent PNG sits on a backdrop tinted with the category color
 * (7% light, 10% dark) over a soft contact shadow, with 8% padding so every item reads at the same scale.
 * Without one (job pending or failed): the original, full bleed, and a soft cross fade when the cutout lands.
 * The backdrop is composed here at display time; nothing is baked into the file.
 */
export function Pic({ image, src, srcClean, category, mode = 'clean', thumb = true, alt = '', className, onClick, size, style }: Props) {
  const clean = mode !== 'clean' ? '' : srcClean ? srcClean : image?.path_clean ? publicUrl('images', image.path_clean) : ''
  const original = image ? publicUrl('images', (thumb && image.path_thumb) || image.path_original) : (src ?? '')
  // readiness is keyed by URL, so a fast load (cache, data:) is never wiped by a reset, and a new URL starts hidden
  const [readySrc, setReadySrc] = useState('')
  const cleanReady = Boolean(clean) && readySrc === clean
  const cleanRef = useCallback((el: HTMLImageElement | null) => { if (el && el.complete && el.naturalWidth > 0) setReadySrc(el.getAttribute('src') ?? '') }, [])

  const box: CSSProperties = { ...(size ? { inlineSize: size, blockSize: size } : null), ...style }
  if (!clean && !original) return <div className={`pic-box empty ${className ?? ''}`} style={box} aria-hidden="true" />

  const tint = { ['--cat' as string]: catColor(category) } as CSSProperties
  return (
    <div className={`pic-box ${clean ? 'has-clean' : ''} ${cleanReady ? 'clean-ready' : ''} ${className ?? ''}`} style={{ ...box, ...tint }} onClick={onClick} role={onClick ? 'button' : undefined}>
      {original && <img className="pic-orig" src={original} alt={clean ? '' : alt} loading="lazy" decoding="async" />}
      {clean && <img ref={cleanRef} className="pic-clean" src={clean} alt={alt} decoding="async" onLoad={e => setReadySrc(e.currentTarget.getAttribute('src') ?? '')} />}
    </div>
  )
}
