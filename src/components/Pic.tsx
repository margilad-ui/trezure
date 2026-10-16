import { publicUrl } from '../lib/supabase'
import type { ItemImage } from '../lib/types'

/** Cover image for an item. Thumb when we have one, else the original. */
export function coverOf(images: ItemImage[] | undefined, coverId?: string | null, thumb = true): string {
  if (!images?.length) return ''
  const sorted = images.slice().sort((a, b) => a.sort - b.sort)
  const img = sorted.find(i => i.id === coverId) ?? sorted[0]
  return publicUrl('images', (thumb && img.path_thumb) || img.path_original)
}

type Props = { src: string; alt?: string; className?: string; onClick?: () => void; size?: number }
export function Pic({ src, alt = '', className, onClick, size }: Props) {
  const style = size ? { inlineSize: size, blockSize: size } : undefined
  if (!src) return <div className={className} style={{ ...style, background: 'var(--surface2)' }} aria-hidden="true" />
  return <img src={src} alt={alt} className={className} style={style} loading="lazy" decoding="async" onClick={onClick} />
}
