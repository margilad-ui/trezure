import { BASE } from '../lib/router'

type Props = { variant?: 'teal' | 'white' | 'ink'; width?: number; className?: string }
export function Logo({ variant = 'teal', width = 140, className }: Props) {
  return <img src={`${BASE}/logo/trezure-logo-${variant}.svg`} alt="TREZURE" width={width} height={Math.round(width * 100 / 379)} className={className} style={{ inlineSize: width, blockSize: 'auto' }} />
}
