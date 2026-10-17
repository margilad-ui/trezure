import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ImagePlus, Loader2, WifiOff, Check, ScanLine, Barcode } from 'lucide-react'
import { useT } from '../i18n'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { LocChip } from '../components/LocChip'
import { LocationPicker } from '../components/LocationPicker'
import { OkiMark } from '../components/Oki'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toast'
import { pickBackCamera, squareFromFile, squareFromVideo } from '../lib/image'
import { enqueue, useQueue, listQueue, type QueuedShot } from '../lib/queue'
import { play, vibrate } from '../lib/sound'
import { useScanLoop } from '../lib/camera'
import { classify, productBarcode } from '../lib/scan'
import { locById } from '../lib/store'

const LS_LOC = 'tz.capture.loc'

type Recent = { id: string; url: string; pending: boolean }

export function Capture() {
  const { t } = useT()
  const { workspace, locations } = useStore()
  const q = useQueue()
  const videoRef = useRef<HTMLVideoElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const urlsRef = useRef<string[]>([])
  const [camErr, setCamErr] = useState(false)
  const [loc, setLoc] = useState<string | null>(() => { try { return localStorage.getItem(LS_LOC) } catch { return null } })
  const [pickOpen, setPickOpen] = useState(false)
  const [qtyOpen, setQtyOpen] = useState(false)
  const [qty, setQty] = useState(1)
  const [count, setCount] = useState(0)
  const [pop, setPop] = useState(false)
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState<Recent[]>([])
  const [lastShot, setLastShot] = useState<QueuedShot | null>(null)
  const [angleMode, setAngleMode] = useState(false)
  // "+ angle" from an item page: /capture?item=<id>. Every shot here attaches to that item, not a new one.
  const [target] = useState<{ id: string; name: string } | null>(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('item')
      return id ? { id, name: sessionStorage.getItem('tz.capture.name') || '' } : null
    } catch { return null }
  })
  const [online, setOnline] = useState(navigator.onLine)
  // a barcode scanned just before (/capture?barcode=...): the next new item carries it
  const [presetBarcode, setPresetBarcode] = useState<string | null>(() => { try { return new URLSearchParams(window.location.search).get('barcode') } catch { return null } })
  // "scan the drawer": the viewfinder reads a place label and sets where you stand
  const [scanMode, setScanMode] = useState(false)
  // a place label seen in the frame while shooting: offered, never switched on its own
  const [suggest, setSuggest] = useState<{ id: string; seen: number } | null>(null)
  const [lastCode, setLastCode] = useState<string | null>(null)

  // the saved location must still exist
  useEffect(() => { if (loc && locations.length && !locations.some(l => l.id === loc)) setLoc(null) }, [loc, locations])
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // camera
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const deviceId = await pickBackCamera()
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 2048 }, height: { ideal: 2048 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 2048 }, height: { ideal: 2048 } },
        }
        const s = await navigator.mediaDevices.getUserMedia(constraints)
        if (cancelled) { s.getTracks().forEach(tr => tr.stop()); return }
        streamRef.current = s
        const track = s.getVideoTracks()[0]
        try {
          const caps = track.getCapabilities?.() as MediaTrackCapabilities & { focusMode?: string[] }
          if (caps?.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
        } catch { /* optional */ }
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}) }
        setCamErr(false)
      } catch { setCamErr(true) }
    }
    void start()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(tr => tr.stop()); streamRef.current = null }
  }, [])

  // restore pending shots from the queue on mount
  useEffect(() => {
    void listQueue().then(items => {
      const list = items.slice(-6).map(s => { const url = URL.createObjectURL(s.thumb); urlsRef.current.push(url); return { id: s.id, url, pending: true } })
      setRecent(list)
    })
    return () => { urlsRef.current.forEach(u => URL.revokeObjectURL(u)); urlsRef.current = [] }
  }, [])

  const chooseLoc = (id: string) => { setLoc(id); setSuggest(null); try { localStorage.setItem(LS_LOC, id) } catch { /* ignore */ } }

  useScanLoop(videoRef, !camErr && !pickOpen && !qtyOpen, found => {
    for (const f of found) {
      const hit = classify(f.rawValue)
      if (hit.kind !== 'location') continue
      const place = locations.find(l => l.code?.toLowerCase() === hit.code.toLowerCase())
      if (!place) { if (scanMode) toast(t('loc.badcode', { code: hit.code }), 'err'); continue }
      if (scanMode) {
        chooseLoc(place.id); setScanMode(false); vibrate(40); play('found')
        toast(t('capture.scan.set', { code: place.code }), 'ok')
      } else if (place.id !== loc) setSuggest({ id: place.id, seen: Date.now() })
      return
    }
  }, scanMode ? 200 : 700, !scanMode)
  // the offer fades once the label has been out of the frame for a few seconds
  useEffect(() => {
    if (!suggest) return
    const id = window.setTimeout(() => setSuggest(s => s && Date.now() - s.seen > 3500 ? null : s), 4000)
    return () => window.clearTimeout(id)
  }, [suggest])

  /** The captured frame flies from the viewfinder into the recent strip, the way a phone camera does. */
  const fly = useCallback((url: string) => {
    const vf = viewRef.current, strip = stripRef.current
    if (!vf || !strip) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const from = vf.getBoundingClientRect(), to = strip.getBoundingClientRect()
    if (!from.width || !to.width) return
    const rtl = document.documentElement.dir === 'rtl'
    const img = document.createElement('img')
    img.src = url
    img.alt = ''
    Object.assign(img.style, {
      position: 'fixed', insetInlineStart: 'auto', left: `${from.left}px`, top: `${from.top}px`,
      width: `${from.width}px`, height: `${from.height}px`, borderRadius: '24px',
      objectFit: 'cover', zIndex: '35', pointerEvents: 'none', willChange: 'transform',
    } as Partial<CSSStyleDeclaration>)
    document.body.appendChild(img)
    const scale = 56 / from.width
    const tx = (rtl ? to.right - 32 : to.left + 32) - (from.left + from.width / 2)
    const ty = (to.top + 32) - (from.top + from.height / 2)
    const anim = img.animate(
      [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${tx}px, ${ty}px) scale(${scale})`, opacity: 0.9 }],
      { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
    const done = () => img.remove()
    anim.onfinish = done; anim.oncancel = done
  }, [])

  const shoot = useCallback(async (file?: File) => {
    if (!workspace) return
    if (!loc) { setPickOpen(true); toast(t('capture.noloc')); return }
    const v = videoRef.current
    if (!file && (!v || !v.videoWidth)) return
    setBusy(true)
    try {
      const isNewItem = !target && !(angleMode && lastShot)
      // a product barcode in the frame is read on the phone, free and silent, and travels with the item
      const barcode = isNewItem ? (presetBarcode ?? (file ? null : await productBarcode(v!))) : null
      const shot = file ? await squareFromFile(file) : await squareFromVideo(v!)
      vibrate(30); play('capture')
      setFlash(true); setTimeout(() => setFlash(false), 140)
      const isAngle = Boolean(target) || Boolean(angleMode && lastShot)
      const queued = await enqueue({
        ws: workspace.id, blob: shot.blob, thumb: shot.thumb, width: shot.width, height: shot.height,
        location_id: loc, qty, angle: isAngle ? 'side' : 'front', barcode,
        item_id: target ? target.id : isAngle ? lastShot!.item_id : crypto.randomUUID(),
      })
      setLastShot(queued)
      if (barcode) { setLastCode(barcode); setPresetBarcode(null) }
      else if (isNewItem) setLastCode(null)
      setAngleMode(false)
      setQty(1)
      if (!isAngle) { setCount(c => c + 1); setPop(true); setTimeout(() => setPop(false), 260) }
      const url = URL.createObjectURL(shot.thumb)
      urlsRef.current.push(url)
      fly(url)
      setRecent(r => [...r.slice(-5), { id: queued.id, url, pending: true }])
    } catch (e) {
      toast(String((e as Error).message || t('common.error')), 'err')
    } finally { setBusy(false) }
  }, [workspace, loc, qty, angleMode, lastShot, target, t, fly, presetBarcode])

  // mark recents as uploaded when the queue drains
  useEffect(() => {
    if (q.pending === 0) setRecent(r => r.map(x => ({ ...x, pending: false })))
  }, [q.pending])

  const leave = useCallback(() => navigate(count > 0 ? '/inbox' : '/'), [count])

  // keyboard: space or enter shoots (desktop testing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pickOpen || qtyOpen) return
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); void shoot() }
      if (e.key === 'Escape') leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shoot, pickOpen, qtyOpen, leave])

  return (
    <div className="capture">
      <div className="capture-top">
        <div className="row" style={{ gap: 8, minInlineSize: 0 }}>
          <LocChip id={loc} onClick={() => setPickOpen(true)} placeholder={t('capture.pickloc')} />
          <button type="button" className="capture-close icon" aria-pressed={scanMode} aria-label={t('capture.scan')} title={t('capture.scan')} onClick={() => setScanMode(m => !m)}><ScanLine size={20} /></button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {!online && <span className="pending-badge"><WifiOff size={14} /> {t('common.offline')}</span>}
          {count > 0 && (
            <span className={`shot-count ${pop ? 'pop' : ''}`} aria-live="polite">
              <OkiMark size={20} color="rgba(255,255,255,.92)" eye="#0a1520" />
              <span className="mono">{count}</span>
            </span>
          )}
          <button type="button" className="capture-close icon" aria-label={t('capture.close')} onClick={leave}><X size={22} /></button>
        </div>
      </div>

      <div className="capture-mid">
        <div className="viewfinder" ref={viewRef}>
          {camErr ? (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: 'rgba(255,255,255,.8)' }}>
              <p>{t('capture.nocam')}</p>
            </div>
          ) : <video ref={videoRef} playsInline muted autoPlay />}
          <div className="grid" aria-hidden="true" />
          {scanMode && <div className="reticle" aria-hidden="true"><i /><i /><i /><i /></div>}
          {suggest && !scanMode && (
            <button type="button" className="loc-suggest" onClick={() => { chooseLoc(suggest.id); vibrate(30); toast(t('capture.scan.set', { code: locById(suggest.id)?.code ?? '' }), 'ok') }}>
              <ScanLine size={16} /> {t('capture.scan.suggest', { code: locById(suggest.id)?.code ?? '' })}
            </button>
          )}
          {(presetBarcode || lastCode) && !scanMode && <span className="code-badge"><Barcode size={14} /> <span className="mono">{presetBarcode ?? lastCode}</span></span>}
          <div className={`flash ${flash ? 'on' : ''}`} aria-hidden="true" />
        </div>
        <p className="capture-hint">{scanMode ? t('capture.scan.hint') : target ? t('capture.forItem', { name: target.name }) : angleMode ? t('capture.hint.again') : t('capture.hint')}</p>
      </div>

      <div className="recent" ref={stripRef} aria-label={t('capture.recent')}>
        {recent.length === 0 && <span className="recent-empty" aria-hidden="true" />}
        {recent.slice().reverse().map(r => (
          <span key={r.id} className="recent-slot">
            <img src={r.url} alt="" className={r.pending ? 'pending' : ''} />
            {r.pending ? <Loader2 size={12} className="spin dot" /> : <Check size={12} className="dot ok" />}
          </span>
        ))}
      </div>

      <div className="capture-controls">
        {target ? (
          <button type="button" className="side-btn" onClick={() => navigate(`/item/${target.id}`)}>
            <Check size={24} />
            <span>{t('capture.forItem.done')}</span>
          </button>
        ) : (
          <button type="button" className="side-btn" aria-pressed={angleMode} onClick={() => lastShot && setAngleMode(a => !a)} disabled={!lastShot} style={{ opacity: lastShot ? 1 : .4 }}>
            <ImagePlus size={24} />
            <span>+ {t('capture.angle')}</span>
          </button>
        )}
        <button type="button" className="shutter" aria-label={t('capture.title')} disabled={busy || camErr} onClick={() => void shoot()} />
        <button type="button" className="side-btn" onClick={() => setQtyOpen(true)}>
          <span className="big">×{qty}</span>
          <span>{t('capture.qty')}</span>
        </button>
      </div>

      <div className="capture-foot">
        {camErr && <button type="button" className="tz-btn quiet" onClick={() => fileRef.current?.click()}>{t('capture.title')}</button>}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void shoot(f); e.target.value = '' }} />
        {count > 0 && (
          <button type="button" className="tz-btn finish" onClick={() => navigate('/inbox')}>
            <Check size={20} />
            {count === 1 ? t('capture.finish.one') : t('capture.finish', { n: count })}
            {q.pending > 0 && <span className="pending-inline">{q.uploading && <Loader2 size={13} className="spin" />} {t('capture.pending', { n: q.pending })}</span>}
          </button>
        )}
      </div>

      <LocationPicker open={pickOpen} onClose={() => setPickOpen(false)} onPick={chooseLoc} />
      <Sheet open={qtyOpen} onClose={() => setQtyOpen(false)} title={t('capture.qty.title')}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          {[1, 2, 3, 5, 10, 20].map(n => <button key={n} type="button" className={`tz-btn ${qty === n ? '' : 'quiet'}`} style={{ minInlineSize: 64 }} onClick={() => { setQty(n); setQtyOpen(false) }}>{n}</button>)}
        </div>
        <label className="tz-label" htmlFor="qtyother">{t('capture.qty.other')}</label>
        <input id="qtyother" className="tz-input mono" inputMode="numeric" type="number" min={1} defaultValue={qty} onKeyDown={e => { if (e.key === 'Enter') { const v = Number((e.target as HTMLInputElement).value); if (v > 0) { setQty(v); setQtyOpen(false) } } }} />
      </Sheet>
    </div>
  )
}
