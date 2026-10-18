import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2, Printer, Bluetooth, BluetoothOff, Minus, Plus } from 'lucide-react'
import { Sheet } from './Sheet'
import { useT, type Key } from '../i18n'
import { drawLabel, labelBlob, labelUrl, SIZES, SIZES_FOR, type LabelData, type LabelKind, type LabelSize } from '../lib/label'
import { bluetoothSupported, connectPrinter, disconnectPrinter, getDensity, printPages, setDensity, toPage, usePrinter, type Paper } from '../lib/niimbot'
import { toast } from './Toast'
import { play } from '../lib/sound'

const LS_SIZE = 'tz.label.size'
const LS_PAPER = 'tz.label.paper'
export interface LabelJob { kind: LabelKind; data: LabelData }

const remembered = (kind: LabelKind): LabelSize => {
  try { const v = localStorage.getItem(`${LS_SIZE}.${kind}`) as LabelSize | null; if (v && SIZES_FOR[kind].includes(v)) return v } catch { /* ignore */ }
  return SIZES_FOR[kind][0]
}

/**
 * One sheet for every label the app prints, one or many. Real size preview, a choice of template, copies,
 * white or clear paper, and a Print button that goes straight to the NIIMBOT over Bluetooth. A PNG for the
 * NIIMBOT app stays as the fallback (one label at a time).
 */
export function PrintSheet({ open, onClose, jobs, title, defaultSize }: { open: boolean; onClose: () => void; jobs: LabelJob[]; title?: string; defaultSize?: LabelSize }) {
  const { t } = useT()
  const pr = usePrinter()
  const kind = jobs[0]?.kind ?? 'location'
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<LabelSize>(() => defaultSize ?? remembered(kind))
  const [copies, setCopies] = useState(1)
  const [paper, setPaper] = useState<Paper>(() => { try { return (localStorage.getItem(LS_PAPER) as Paper) || 'white' } catch { return 'white' } })
  const [density, setDens] = useState(getDensity())
  const [busy, setBusy] = useState(false)
  const many = jobs.length > 1
  const spec = SIZES[size]

  useEffect(() => { if (open) { setSize(defaultSize ?? remembered(kind)); setCopies(1) } }, [open, kind, defaultSize])

  // preview: the first label at real size, or a strip of small ones for a batch
  useEffect(() => {
    if (!open || !jobs.length) return
    let dead = false
    void (async () => {
      const shown = jobs.slice(0, many ? 6 : 1)
      const canvases = await Promise.all(shown.map(j => drawLabel(j.kind, size, j.data)))
      if (dead || !box.current) return
      const scale = many ? 0.55 : 1
      canvases.forEach(c => {
        c.style.inlineSize = `${spec.w * scale}mm`
        c.style.blockSize = `${spec.h * scale}mm`
        c.className = `label-canvas${spec.round ? ' round' : ''}`
      })
      box.current.replaceChildren(...canvases)
    })().catch(() => {})
    return () => { dead = true }
  }, [open, jobs, size, many, spec])

  const pick = (s: LabelSize) => { setSize(s); try { localStorage.setItem(`${LS_SIZE}.${kind}`, s) } catch { /* ignore */ } }
  const pickPaper = (p: Paper) => { setPaper(p); try { localStorage.setItem(LS_PAPER, p) } catch { /* ignore */ } }

  async function print() {
    setBusy(true)
    try {
      const pages = []
      for (const j of jobs) pages.push({ canvas: toPage(await drawLabel(j.kind, size, j.data), spec.rotate, pr.head), copies })
      await printPages(pages, paper)
      play('complete')
      toast(t('print.done', { n: jobs.length * copies }), 'ok')
      onClose()
    } catch (e) {
      const m = String((e as Error)?.message || e)
      if (!/cancel|chosen/i.test(m)) toast(t('print.error', { msg: m.slice(0, 90) }), 'err', 6000)
    } finally { setBusy(false) }
  }

  async function download() {
    const j = jobs[0]; if (!j) return
    setBusy(true)
    try {
      const blob = await labelBlob(j.kind, size, j.data)
      const a = document.createElement('a')
      const url = URL.createObjectURL(blob)
      a.href = url
      a.download = `${j.data.code.replace(/[^\w.-]+/g, '-')}-${size}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      toast(t('label.downloaded'), 'ok', 4000)
    } catch (e) { toast(String((e as Error).message), 'err') } finally { setBusy(false) }
  }

  const bt = bluetoothSupported()
  const total = jobs.length * copies
  return (
    <Sheet open={open} onClose={onClose} title={title ?? (many ? t('print.title.many', { n: jobs.length }) : t('label.title'))}>
      <div className="seg print-sizes" role="group" aria-label={t('print.size')}>
        {SIZES_FOR[kind].map(s => (
          <button key={s} type="button" aria-pressed={size === s} onClick={() => pick(s)}>{t(`label.size.${s}` as Key)}</button>
        ))}
      </div>
      <div className={`label-preview ${many ? 'many' : ''}`} ref={box} aria-label={t('label.preview')} />
      {many && jobs.length > 6 && <p className="meta">{t('print.more', { n: jobs.length - 6 })}</p>}
      <p className="meta">{t('print.roll', { roll: spec.roll })}</p>

      <div className="print-row">
        <div className="field">
          <label>{many ? t('print.copies.each') : t('print.copies')}</label>
          <div className="qty-ctl">
            <button type="button" onClick={() => setCopies(n => Math.max(1, n - 1))} aria-label="-1"><Minus size={18} /></button>
            <span className="qty">{copies}</span>
            <button type="button" onClick={() => setCopies(n => Math.min(50, n + 1))} aria-label="+1"><Plus size={18} /></button>
          </div>
        </div>
        <div className="field">
          <label>{t('print.paper')}</label>
          <div className="seg">
            {(['white', 'clear'] as Paper[]).map(p => <button key={p} type="button" aria-pressed={paper === p} onClick={() => pickPaper(p)}>{t(`print.paper.${p}` as Key)}</button>)}
          </div>
        </div>
      </div>
      {paper === 'clear' && <p className="meta warn-line">{t('print.clear.warn')}</p>}

      {bt ? (
        <>
          <button type="button" className="tz-btn" disabled={busy || !jobs.length || pr.status === 'printing' || pr.status === 'connecting'} onClick={() => void print()}>
            {busy ? <Loader2 className="spin" size={18} /> : <Printer size={18} />}
            {pr.status === 'printing' && pr.progress ? t('print.progress', { done: pr.progress.done, total: pr.progress.total }) : total === 1 ? t('print.go.one') : t('print.go', { n: total })}
          </button>
          <div className="printer-line">
            {pr.status === 'connected' || pr.status === 'printing'
              ? <><Bluetooth size={16} /> <span className="grow">{t('print.connected', { name: pr.name ?? 'NIIMBOT' })}</span><button type="button" className="tz-btn ghost sm" onClick={() => void disconnectPrinter()}>{t('print.disconnect')}</button></>
              : <><BluetoothOff size={16} /> <span className="grow">{t('print.notconnected')}</span><button type="button" className="tz-btn quiet sm" disabled={pr.status === 'connecting'} onClick={() => void connectPrinter().catch(() => {})}>{pr.status === 'connecting' ? <Loader2 size={15} className="spin" /> : null}{t('print.connect')}</button></>}
          </div>
          <details className="print-adv">
            <summary className="meta">{t('print.adv')}</summary>
            <div className="field" style={{ marginBlockStart: 8 }}>
              <label>{t('print.density')}</label>
              <div className="seg">{[1, 2, 3, 4, 5].map(v => <button key={v} type="button" aria-pressed={density === v} onClick={() => { setDens(v); setDensity(v) }}>{v}</button>)}</div>
            </div>
          </details>
        </>
      ) : (
        <p className="meta warn-line">{t('print.nobt')}</p>
      )}
      {!many && (
        <button type="button" className={`tz-btn ${bt ? 'ghost' : ''}`} disabled={busy || !jobs.length} onClick={() => void download()}>
          <Download size={18} /> {t('label.download')}
        </button>
      )}
    </Sheet>
  )
}

/** The single label sheet the item and place screens already use. */
export function LabelSheet({ open, onClose, kind, data }: { open: boolean; onClose: () => void; kind: LabelKind; data: LabelData | null }) {
  const jobs = useMemo(() => (data ? [{ kind, data }] : []), [kind, data])
  return <PrintSheet open={open} onClose={onClose} jobs={jobs} />
}

export { labelUrl }
export type { LabelData }
