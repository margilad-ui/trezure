import { useCallback, useRef, useState } from 'react'
import { X, Flashlight, ArrowLeft, Camera, MapPin, Loader2, Box } from 'lucide-react'
import { useT } from '../i18n'
import { navigate } from '../lib/router'
import { useStore, locById, locLabel, refreshRefs } from '../lib/store'
import { useBackCamera, useScanLoop } from '../lib/camera'
import { classify, type ScanHit } from '../lib/scan'
import { findByBarcode, adjustQtyAt, fetchItem, placesOf, createBoxWithCode, placeBox } from '../lib/api'
import type { ItemWithImages } from '../lib/types'
import { LocChip } from '../components/LocChip'
import { LocationPicker } from '../components/LocationPicker'
import { Pic, coverImage } from '../components/Pic'
import { Oki } from '../components/Oki'
import { toast } from '../components/Toast'
import { play, vibrate } from '../lib/sound'

const LS_LOC = 'tz.capture.loc'

type Result =
  | { kind: 'busy'; raw: string }
  | { kind: 'items'; digits: string; items: ItemWithImages[] }
  | { kind: 'unknown'; digits: string }
  | { kind: 'place'; id: string }
  | { kind: 'badplace'; code: string }
  | { kind: 'newbox'; id: string }
  | { kind: 'foreign'; raw: string }

/**
 * One scanner for everything with a code on it. A place label sets "where I am standing" and offers to
 * open the place; a product barcode finds the item and adds one in that place; an unknown barcode goes to
 * the camera with the code already filled in. It keeps reading, so counting a shelf is scan, scan, scan.
 */
export function Scan() {
  const { t, lang } = useT()
  const { workspace, locations } = useStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const { error, torch, toggleTorch } = useBackCamera(videoRef)
  const [here, setHere] = useState<string | null>(() => { try { return localStorage.getItem(LS_LOC) } catch { return null } })
  const [pick, setPick] = useState(false)
  const [res, setRes] = useState<Result | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [placeFor, setPlaceFor] = useState<string | null>(null)
  const last = useRef<{ raw: string; at: number }>({ raw: '', at: 0 })

  const setPlace = (id: string) => { setHere(id); try { localStorage.setItem(LS_LOC, id) } catch { /* ignore */ } }

  const onHit = useCallback(async (hit: ScanHit) => {
    if (!workspace) return
    vibrate(25)
    if (hit.kind === 'location') {
      const loc = locations.find(l => l.code?.toLowerCase() === hit.code.toLowerCase())
      if (!loc) { setRes({ kind: 'badplace', code: hit.code }); return }
      // a box label seen for the first time: it needs a place before it can be "where I stand"
      if (loc.pending) { play('found'); setRes({ kind: 'newbox', id: loc.id }); return }
      setPlace(loc.id); play('found'); setRes({ kind: 'place', id: loc.id })
      return
    }
    if (hit.kind === 'item') { play('found'); navigate(`/item/${hit.id}`); return }
    if (hit.kind === 'barcode') {
      setRes({ kind: 'busy', raw: hit.digits })
      try {
        const items = await findByBarcode(workspace.id, hit.digits)
        if (items.length) { play('found'); setRes({ kind: 'items', digits: hit.digits, items }) }
        else setRes({ kind: 'unknown', digits: hit.digits })
      } catch { setRes({ kind: 'unknown', digits: hit.digits }) }
      return
    }
    setRes({ kind: 'foreign', raw: hit.raw })
  }, [workspace, locations])

  useScanLoop(videoRef, !error && !pick, found => {
    const raw = found[0].rawValue
    const now = Date.now()
    // the same code held in front of the camera is one read, not ten
    if (raw === last.current.raw && now - last.current.at < 2500) { last.current.at = now; return }
    last.current = { raw, at: now }
    void onHit(classify(raw))
  })

  async function addOne(it: ItemWithImages) {
    setAdding(it.id)
    try {
      const r = await adjustQtyAt(it.id, here, 1)
      play('capture')
      const code = locById(here ?? it.location_id)?.code ?? ''
      toast(t('scan.added', { n: r.here, code }), 'ok')
      const fresh = await fetchItem(it.id)
      if (fresh) setRes(cur => cur?.kind === 'items' ? { ...cur, items: cur.items.map(x => x.id === it.id ? fresh : x) } : cur)
    } catch (e) { toast(String((e as Error).message), 'err') } finally { setAdding(null) }
  }

  const back = <ArrowLeft size={18} style={{ transform: lang === 'he' ? undefined : 'rotate(180deg)' }} />

  return (
    <div className="capture scan">
      <div className="capture-top">
        <LocChip id={here} onClick={() => setPick(true)} placeholder={t('scan.here.none')} />
        <div className="row" style={{ gap: 8 }}>
          {torch !== null && <button type="button" className="capture-close icon" aria-pressed={torch} aria-label={t('scan.torch')} onClick={() => void toggleTorch()}><Flashlight size={20} /></button>}
          <button type="button" className="capture-close icon" aria-label={t('capture.close')} onClick={() => history.length > 1 ? history.back() : navigate('/')}><X size={22} /></button>
        </div>
      </div>

      <div className="capture-mid">
        <div className="viewfinder">
          {error ? <div className="scan-err"><p>{t('capture.nocam')}</p></div> : <video ref={videoRef} playsInline muted autoPlay />}
          <div className="reticle" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
        <p className="capture-hint">{t('scan.hint')}</p>
      </div>

      <div className="scan-result" aria-live="polite">
        {!res && <div className="scan-card idle"><Oki size={44} expression="ok" pose="search" /><p>{t('scan.idle')}</p></div>}
        {res?.kind === 'busy' && <div className="scan-card"><Loader2 className="spin" size={22} /><p className="mono">{res.raw}</p></div>}
        {res?.kind === 'place' && (
          <div className="scan-card">
            <MapPin size={22} />
            <div className="grow"><p className="lead">{t('scan.place.set')}</p><p className="meta">{locLabel(res.id)}</p></div>
            <button type="button" className="tz-btn sm" onClick={() => navigate(`/loc/${res.id}`)}>{t('scan.place.open')} {back}</button>
          </div>
        )}
        {res?.kind === 'badplace' && (/^BX-\d{1,6}$/i.test(res.code)
          ? <div className="scan-card"><Oki size={44} expression="ok" pose="point" /><div className="grow"><p className="lead">{t('box.unknown.short')}</p><p className="meta mono">{res.code.toUpperCase()}</p></div><button type="button" className="tz-btn sm" onClick={() => workspace && void createBoxWithCode(workspace.id, res.code.toUpperCase()).then(async id => { await refreshRefs(); navigate(`/loc/${id}`) }).catch(e => toast(String((e as Error).message), 'err'))}><Box size={16} /> {t('box.create.short')}</button></div>
          : <div className="scan-card warn"><Oki size={40} expression="unsure" /><p>{t('loc.badcode', { code: res.code })}</p></div>)}
        {res?.kind === 'newbox' && (
          <div className="scan-card">
            <Oki size={44} expression="ok" pose="point" />
            <div className="grow"><p className="lead">{t('box.where.short')}</p><p className="meta mono">{locById(res.id)?.code}</p></div>
            <button type="button" className="tz-btn sm" onClick={() => setPlaceFor(res.id)}><MapPin size={16} /> {t('box.pick')}</button>
          </div>
        )}
        {res?.kind === 'foreign' && <div className="scan-card warn"><Oki size={40} expression="unsure" /><p>{t('scan.foreign')}</p></div>}
        {res?.kind === 'unknown' && (
          <div className="scan-card">
            <Oki size={44} expression="unsure" />
            <div className="grow"><p className="lead">{t('scan.unknown')}</p><p className="meta mono">{res.digits}</p></div>
            <button type="button" className="tz-btn sm" onClick={() => navigate(`/capture?barcode=${encodeURIComponent(res.digits)}`)}><Camera size={16} /> {t('scan.shoot')}</button>
          </div>
        )}
        {res?.kind === 'items' && res.items.map(it => {
          const at = here ?? it.location_id
          const there = placesOf(it).find(p => p.location_id === at)?.qty ?? 0
          return (
            <div key={it.id} className="scan-card item">
              <Pic size={56} image={coverImage(it.item_images, it.cover_image_id)} category={it.category_id} />
              <button type="button" className="grow scan-item-name" onClick={() => navigate(`/item/${it.id}`)}>
                <span className="lead">{it.name || t('remove.untitled')}</span>
                <span className="meta">{t('scan.item.qty', { n: there, code: locById(at)?.code ?? '' })} · {t('scan.item.total', { n: it.qty })}</span>
              </button>
              <button type="button" className="tz-btn sm" disabled={adding === it.id} onClick={() => void addOne(it)}>{adding === it.id ? <Loader2 size={16} className="spin" /> : <span className="plus-one">+1</span>}</button>
            </div>
          )
        })}
      </div>

      <LocationPicker open={pick} onClose={() => setPick(false)} onPick={setPlace} />
      <LocationPicker open={Boolean(placeFor)} onClose={() => setPlaceFor(null)} title={t('box.pick')} onPick={pid => {
        const id = placeFor; if (!id) return
        void placeBox(id, pid).then(async () => { await refreshRefs(); setPlace(id); setRes({ kind: 'place', id }); toast(t('box.placed', { where: locLabel(pid) }), 'ok') }).catch(e => toast(String((e as Error).message), 'err'))
      }} />
    </div>
  )
}
