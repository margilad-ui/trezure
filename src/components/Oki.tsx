import { useEffect, useState } from 'react'
import { BASE } from '../lib/router'

/**
 * OKI, the octopus. The master PNG is fetched at build time from brand Storage; if it is missing
 * (local builds without network) the vector silhouette takes over so nothing breaks.
 */
type Props = { variant?: 'silhouette' | 'master'; size?: number; color?: string; className?: string; title?: string }

export function OkiMark({ size = 24, color = 'var(--teal)', eye = '#fff', className }: { size?: number; color?: string; eye?: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true" style={{ inlineSize: size, blockSize: size, flex: 'none' }}>
      <ellipse cx="50" cy="40" rx="34" ry="32" fill={color} />
      <path d="M28 62 C 20 74, 6 74, 10 88 C 12 94, 20 94, 22 88 M41 68 C 37 80, 30 86, 34 96 M59 68 C 63 80, 70 86, 66 96 M72 62 C 80 74, 94 74, 90 88 C 88 94, 80 94, 78 88" stroke={color} strokeWidth="12" strokeLinecap="round" fill="none" />
      <circle cx="37" cy="40" r="7.5" fill={eye} /><circle cx="63" cy="40" r="7.5" fill={eye} />
      <path d="M43 54 q7 6 14 0" stroke={eye} strokeWidth="3.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

let masterOk: boolean | null = null
export function Oki({ variant = 'master', size = 120, color, className, title }: Props) {
  const [ok, setOk] = useState<boolean | null>(masterOk)
  useEffect(() => {
    if (variant !== 'master' || masterOk !== null) return
    const img = new Image()
    img.onload = () => { masterOk = true; setOk(true) }
    img.onerror = () => { masterOk = false; setOk(false) }
    img.src = `${BASE}/oki/master-480.png`
  }, [variant])
  if (variant === 'silhouette' || ok === false) return <OkiMark size={size} color={color} className={className} />
  const src = size <= 160 ? `${BASE}/oki/master-160.png` : `${BASE}/oki/master-480.png`
  return <img src={src} alt={title ?? 'OKI'} width={size} height={size} className={className} style={{ inlineSize: size, blockSize: size, objectFit: 'contain', visibility: ok ? 'visible' : 'hidden' }} />
}
