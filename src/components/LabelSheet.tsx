import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, Printer } from 'lucide-react'
import { Sheet } from './Sheet'
import { useT, type Key } from '../i18n'
import { drawLabel, labelBlob, labelUrl, type LabelData, type LabelKind, type LabelSize } from '../lib/label'
import { toast } from './Toast'

const LS_SIZE = 'tz.label.size'

/**
 * Print one label. Shows it at real size on screen, then hands over a PNG at 203dpi for the NIIMBOT app.
 * The B1 takes rolls from 20 to 50mm, so only the sizes that fit it are offered.
 */
export function LabelSheet({ open, onClose, kind, data }: { open: boolean; onClose: () => void; kind: LabelKind; data: LabelData | null }) {
  const { t } = useT()
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<LabelSize>(() => { try { return (localStorage.getItem(LS_SIZE) as LabelSize) || '50x30' } catch { return '50x30' } })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !data) return
    let dead = false
    void drawLabel(kind, size, data).then(c => {
      if (dead || !box.current) return
      c.style.inlineSize = size === '50x30' ? '50mm' : '30mm'
      c.style.blockSize = size === '50x30' ? '30mm' : '50mm'
      c.className = 'label-canvas'
      box.current.replaceChildren(c)
    }).catch(() => {})
    return () => { dead = true }
  }, [open, kind, size, data])

  async function download() {
    if (!data) return
    setBusy(true)
    try {
      const blob = await labelBlob(kind, size, data)
      const a = document.createElement('a')
      const url = URL.createObjectURL(blob)
      a.href = url
      a.download = `${data.code.replace(/[^\w.-]+/g, '-')}-${size}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      toast(t('label.downloaded'), 'ok', 4000)
    } catch (e) { toast(String((e as Error).message), 'err') } finally { setBusy(false) }
  }

  const pick = (s: LabelSize) => { setSize(s); try { localStorage.setItem(LS_SIZE, s) } catch { /* ignore */ } }

  return (
    <Sheet open={open} onClose={onClose} title={t('label.title')}>
      <div className="seg" style={{ justifySelf: 'start' }}>
        {(['50x30', '30x50'] as LabelSize[]).map(s => (
          <button key={s} type="button" aria-pressed={size === s} onClick={() => pick(s)}>{t(`label.size.${s}` as Key)}</button>
        ))}
      </div>
      <div className="label-preview" ref={box} aria-label={t('label.preview')} />
      <p className="meta">{t('label.hint')}</p>
      <button type="button" className="tz-btn" disabled={busy || !data} onClick={() => void download()}>
        {busy ? <Loader2 className="spin" size={18} /> : <Download size={18} />} {t('label.download')}
      </button>
      <p className="meta"><Printer size={13} style={{ verticalAlign: '-2px' }} /> {t('label.niimbot')}</p>
    </Sheet>
  )
}

export { labelUrl }
export type { LabelData }
