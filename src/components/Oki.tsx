import { useEffect, useRef, useState } from 'react'
import { BASE } from '../lib/router'
import './oki.css'

/**
 * OKI, the octopus, as a vector with named parts.
 *
 * Parts: body, mantle (the darker underside), arm1..arm4 (outer left, inner left, inner right, outer right),
 * eyeL/eyeR, lidL/lidR, browL/browR, mouth. Expressions swap the eye and mouth paths, poses swap arm paths
 * (Chromium interpolates `d` so the arms morph between poses) and add a CSS animation. Blinking is a class
 * toggled on a random 3 to 7 second timer; everything else is CSS only and stops under prefers-reduced-motion.
 *
 * The illustrated PNG master (with the cardboard box) stays for the app icon and the About page: <OkiPhoto />.
 */
export type OkiExpression = 'ok' | 'thinking' | 'unsure' | 'proud' | 'sleep'
export type OkiPose = 'idle' | 'wave' | 'point' | 'search'

type Props = {
  size?: number
  expression?: OkiExpression
  pose?: OkiPose
  /** blink on a random timer; defaults to on when size >= 40 */
  live?: boolean
  /** gentle hover; defaults to on for idle and search when size >= 80 */
  float?: boolean
  /** mirror horizontally (point towards the other side) */
  flip?: boolean
  /** crop to the face so expressions read at small sizes; defaults to on under 48px */
  bust?: boolean
  color?: string
  shade?: string
  ink?: string
  className?: string
  title?: string
  style?: React.CSSProperties
}

// Arm paths per pose. Same command structure everywhere so `d` can interpolate.
const ARMS: Record<OkiPose, [string, string, string, string]> = {
  idle: [
    'M74 122 C 54 134, 34 130, 30 110',
    'M90 130 C 88 152, 78 166, 58 170',
    'M110 130 C 112 152, 122 166, 142 170',
    'M126 122 C 146 134, 166 130, 170 110',
  ],
  wave: [
    'M74 122 C 54 134, 34 130, 30 110',
    'M90 130 C 88 152, 78 166, 58 170',
    'M110 130 C 112 152, 122 166, 142 170',
    'M126 118 C 152 112, 170 96, 174 68',
  ],
  point: [
    'M74 122 C 54 134, 34 130, 30 110',
    'M90 130 C 88 152, 78 166, 58 170',
    'M110 130 C 112 152, 122 166, 142 170',
    'M126 120 C 148 118, 166 116, 188 110',
  ],
  search: [
    'M74 122 C 52 128, 34 118, 30 96',
    'M90 130 C 88 152, 78 166, 58 170',
    'M110 130 C 112 152, 122 166, 142 170',
    'M126 122 C 146 134, 166 130, 170 110',
  ],
}
// thinking and unsure bring a front arm up to the cheek, whatever the pose (drawn above the head)
const ARM_CHIN = 'M116 134 C 142 146, 154 122, 136 102'

const MOUTH: Record<OkiExpression, string> = {
  ok: 'M91 104 q9 8 18 0',
  thinking: 'M93 107 l14 -3',
  unsure: 'M100 103 a3.4 3.4 0 1 0 0.01 0',
  proud: 'M87 103 q13 12 26 0',
  sleep: 'M95 106 q5 3 10 0',
}

export function Oki({ size = 120, expression = 'ok', pose = 'idle', live, float, flip, bust, color = 'var(--teal)', shade = 'var(--teal-dark)', ink = 'var(--ink)', className, title, style }: Props) {
  const doLive = live ?? size >= 40
  const doBust = bust ?? size < 48
  const doFloat = float ?? (size >= 80 && expression !== 'sleep' && (pose === 'idle' || pose === 'search'))
  const [blink, setBlink] = useState(false)
  const timer = useRef<number>(0)

  useEffect(() => {
    if (!doLive || expression === 'sleep' || expression === 'proud') return
    let alive = true
    const schedule = () => {
      timer.current = window.setTimeout(() => {
        if (!alive) return
        setBlink(true)
        window.setTimeout(() => { if (alive) setBlink(false) }, 170)
        schedule()
      }, 3000 + Math.random() * 4000)
    }
    schedule()
    return () => { alive = false; window.clearTimeout(timer.current) }
  }, [doLive, expression])

  const arms = ARMS[pose]
  const chin = expression === 'thinking' || expression === 'unsure'
  const eyesClosed = expression === 'sleep' || expression === 'proud'
  const cls = ['oki', `oki-x-${expression}`, `oki-p-${pose}`, blink ? 'blink' : '', doFloat ? 'float' : '', className ?? ''].filter(Boolean).join(' ')

  return (
    <svg
      viewBox={doBust ? '34 20 132 132' : '0 0 200 200'} width={size} height={size} className={cls}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}
      style={{ inlineSize: size, blockSize: size, flex: 'none', ...(flip ? { scale: '-1 1' } : null), ...style }}
    >
      <defs>
        <clipPath id="oki-head"><ellipse cx="100" cy="84" rx="60" ry="58" /></clipPath>
      </defs>
      <g className="oki-all">
        {/* arms: shade copy first (the one shadow), then the arm */}
        <g className="oki-arms" fill="none" strokeLinecap="round" strokeWidth="19">
          <g stroke={shade} transform="translate(0 3.5)">
            <path className="arm arm1" d={arms[0]} /><path className="arm arm2" d={arms[1]} /><path className="arm arm3" d={arms[2]} /><path className="arm arm4" d={arms[3]} />
          </g>
          <g stroke={color}>
            <path className="arm arm1" d={arms[0]} /><path className="arm arm2" d={arms[1]} /><path className="arm arm3" d={arms[2]} /><path className="arm arm4" d={arms[3]} />
          </g>
        </g>

        <g className="oki-head">
          <ellipse className="body" cx="100" cy="84" rx="60" ry="58" fill={color} />
          <ellipse className="mantle" cx="100" cy="142" rx="50" ry="24" fill={shade} clipPath="url(#oki-head)" />

          <g className="oki-face">
            {/* brows only when unsure */}
            <g className="brows" fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="round">
              <path className="browL" d="M68 68 Q 77 61, 86 63" /><path className="browR" d="M114 63 Q 123 61, 132 68" />
            </g>

            {/* open eyes */}
            <g className="eyes" style={{ display: eyesClosed ? 'none' : undefined }}>
              <g className="eye eyeL"><circle cx="78" cy="84" r="12.5" fill={ink} /><circle cx="73.5" cy="79.5" r="3.6" fill="#fff" /></g>
              <g className="eye eyeR"><circle cx="122" cy="84" r="12.5" fill={ink} /><circle cx="117.5" cy="79.5" r="3.6" fill="#fff" /></g>
              {/* lids: body colored, scale in from the top on blink */}
              <ellipse className="lid lidL" cx="78" cy="84" rx="13.5" ry="13.5" fill={color} />
              <ellipse className="lid lidR" cx="122" cy="84" rx="13.5" ry="13.5" fill={color} />
            </g>

            {/* closed eyes: a soft line when asleep, a happy arc when proud */}
            <g className="eyes-closed" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" style={{ display: eyesClosed ? undefined : 'none' }}>
              {expression === 'proud'
                ? <><path d="M66 88 q12 -13 24 0" /><path d="M110 88 q12 -13 24 0" /></>
                : <><path d="M67 86 q11 6 22 0" /><path d="M111 86 q11 6 22 0" /></>}
            </g>

            <path className="mouth" d={MOUTH[expression]} fill={expression === 'unsure' ? ink : 'none'} stroke={ink} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </g>

          {/* front arm to the cheek when thinking or unsure */}
          {chin && (
            <g className="arm-chin" fill="none" strokeLinecap="round" strokeWidth="19">
              <path d={ARM_CHIN} stroke={shade} transform="translate(0 3.5)" /><path d={ARM_CHIN} stroke={color} />
            </g>
          )}

          {/* sparkles when proud */}
          {expression === 'proud' && (
            <g className="sparks" fill={color}>
              <path d="M28 70 l3 -8 3 8 8 3 -8 3 -3 8 -3 -8 -8 -3z" /><path d="M166 56 l2.4 -6.4 2.4 6.4 6.4 2.4 -6.4 2.4 -2.4 6.4 -2.4 -6.4 -6.4 -2.4z" />
            </g>
          )}
        </g>
      </g>
    </svg>
  )
}

/** Tiny single-color mark for counters and chips (unchanged from sprint 1). */
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

/** The illustrated PNG master from brand Storage (OKI holding a box). Falls back to the vector when missing. */
let masterOk: boolean | null = null
export function OkiPhoto({ size = 160, className, title }: { size?: number; className?: string; title?: string }) {
  const [ok, setOk] = useState<boolean | null>(masterOk)
  useEffect(() => {
    if (masterOk !== null) return
    const img = new Image()
    img.onload = () => { masterOk = true; setOk(true) }
    img.onerror = () => { masterOk = false; setOk(false) }
    img.src = `${BASE}/oki/master-480.png`
  }, [])
  if (ok === false) return <Oki size={size} className={className} title={title} />
  const src = size <= 160 ? `${BASE}/oki/master-160.png` : `${BASE}/oki/master-480.png`
  return <img src={src} alt={title ?? 'OKI'} width={size} height={size} className={className} style={{ inlineSize: size, blockSize: size, objectFit: 'contain', visibility: ok ? 'visible' : 'hidden' }} />
}
