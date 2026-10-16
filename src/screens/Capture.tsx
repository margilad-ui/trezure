import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ImagePlus, Loader2, WifiOff } from 'lucide-react'
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

const LS_LOC = 'tz.capture.loc'

type Recent = { id: string; url: string; pending: boolean }

export function Capture() {
  const { t } = useT()
  const { workspace, locations } = useStore()
  const q = useQueue()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
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
  const [online, setOnline] = useState(navigator.onLine)

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

  // restore recents from the queue (pending) on mount
  useEffect(() => {
    void listQueue().then(items => {
      setRecent(items.slice(-6).map(s => ({ id: s.id, url: URL.createObjectURL(s.thumb), pending: true })))
    })
  }, [])
  useEffect(() => () => { recent.forEach(r => URL.revokeObjectURL(r.url)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const chooseLoc = (id: string) => { setLoc(id); try { localStorage.setItem(LS_LOC, id) } catch { /* ignore */ } }

  const shoot = useCallback(async (file?: File) => {
    if (!workspace) return
    if (!loc) { setPickOpen(true); toast(t('capture.noloc')); return }
    const v = videoRef.current
    if (!file && (!v || !v.videoWidth)) return
    setBusy(true)
    try {
      const shot = file ? await squareFromFile(file) : await squareFromVideo(v!)
      vibrate(30); play('capture')
      setFlash(true); setTimeout(() => setFlash(false), 140)
      const isAngle = Boolean(angleMode && lastShot)
      const queued = await enqueue({
        ws: workspace.id, blob: shot.blob, thumb: shot.thumb, width: shot.width, height: shot.height,
        location_id: loc, qty, angle: isAngle ? 'side' : 'front',
        item_id: isAngle ? lastShot!.item_id : crypto.randomUUID(),
      })
      setLastShot(queued)
      setAngleMode(false)
      setQty(1)
      setCount(c => c + 1); setPop(true); setTimeout(() => setPop(false), 240)
      const url = URL.createObjectURL(shot.thumb)
      setRecent(r => [...r.slice(-5), { id: queued.id, url, pending: true }])
    } catch (e) {
      toast(String((e as Error).message || t('common.error')), 'err')
    } finally { setBusy(false) }
  }, [workspace, loc, qty, angleMode, lastShot, t])

  // mark recents as uploaded when the queue drains
  useEffect(() => {
    if (q.pending === 0) setRecent(r => r.map(x => ({ ...x, pending: false })))
  }, [q.pending])

  // keyboard: space or enter shoots (desktop testing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pickOpen || qtyOpen) return
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); void shoot() }
      if (e.key === 'Escape') navigate('/')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shoot, pickOpen, qtyOpen])

  return (
    <div className="capture">
      <div className="capture-top">
        <LocChip id={loc} onClick={() => setPickOpen(true)} placeholder={t('capture.pickloc')} />
        <div className="row">
          {!online && <span className="pending-badge"><WifiOff size={14} /> {t('common.offline')}</span>}
          {q.pending > 0 && <span className="pending-badge">{q.uploading && <Loader2 size={14} className="spin" />} {t('capture.pending', { n: q.pending })}</span>}
          <button type="button" className="capture-close icon" aria-label={t('capture.close')} onClick={() => navigate('/')}><X size={22} /></button>
        </div>
      </div>

      <div className="capture-mid">
        <div className="viewfinder">
          {camErr ? (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: 'rgba(255,255,255,.8)' }}>
              <p>{t('capture.nocam')}</p>
            </div>
          ) : <video ref={videoRef} playsInline muted autoPlay />}
          <div className="grid" aria-hidden="true" />
          <div className={`flash ${flash ? 'on' : ''}`} aria-hidden="true" />
        </div>
        <p className="capture-hint">{angleMode ? t('capture.hint.again') : t('capture.hint')}</p>
      </div>

      <div className="capture-controls">
        <button type="button" className="side-btn" aria-pressed={angleMode} onClick={() => lastShot && setAngleMode(a => !a)} disabled={!lastShot} style={{ opacity: lastShot ? 1 : .4 }}>
          <ImagePlus size={24} />
          <span>+ {t('capture.angle')}</span>
        </button>
        <button type="button" className="shutter" aria-label={t('capture.title')} disabled={busy || camErr} onClick={() => void shoot()} />
        <button type="button" className="side-btn" onClick={() => setQtyOpen(true)}>
          <span className="big">×{qty}</span>
          <span>{t('capture.qty')}</span>
        </button>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', padding: '0 20px 6px' }}>
        <span className={`counter ${pop ? 'pop' : ''}`}><OkiMark size={24} color="rgba(255,255,255,.9)" eye="#0a1520" />{count}</span>
        {camErr && <button type="button" className="tz-btn quiet sm" onClick={() => fileRef.current?.click()}>{t('capture.title')}</button>}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void shoot(f); e.target.value = '' }} />
      </div>
      <div className="recent" aria-label={t('capture.recent')}>
        {recent.map(r => <img key={r.id} src={r.url} alt="" className={r.pending ? 'pending' : ''} />)}
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
