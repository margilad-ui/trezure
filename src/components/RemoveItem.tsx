import { useState } from 'react'
import { Archive, Trash2, Loader2 } from 'lucide-react'
import { Sheet } from './Sheet'
import { useT } from '../i18n'
import { archiveItem, unarchiveItem, deleteItem } from '../lib/api'
import { toast } from './Toast'
import type { ItemWithImages } from '../lib/types'

/**
 * One sheet for the two ways an item leaves the list: archive (reversible, keeps the history) and
 * permanent delete (row and image files, not reversible). Delete always asks, and says what is lost.
 */
export function RemoveItem({ item, open, onClose, onDone }: { item: ItemWithImages | null; open: boolean; onClose: () => void; onDone: (mode: 'archive' | 'delete') => void }) {
  const { t } = useT()
  const [busy, setBusy] = useState<'archive' | 'delete' | null>(null)
  const [confirming, setConfirming] = useState(false)
  if (!item) return null

  const close = () => { setConfirming(false); onClose() }
  async function run(mode: 'archive' | 'delete') {
    if (!item) return
    setBusy(mode)
    try {
      if (mode === 'archive') await archiveItem(item)
      else await deleteItem(item)
      onDone(mode)
      if (mode === 'archive') toast(t('item.archived'), 'ok', 2600, { label: t('undo'), run: () => { void unarchiveItem(item).catch(() => {}) } })
      else toast(t('item.deleted'), 'ok')
      close()
    } catch (e) {
      toast(String((e as Error).message || t('common.error')), 'err')
    } finally { setBusy(null) }
  }

  const n = item.item_images?.length ?? 0
  return (
    <Sheet open={open} onClose={close} title={item.name || t('remove.untitled')}>
      {!confirming ? (
        <>
          <p className="dim">{t('remove.body')}</p>
          <button type="button" className="tz-btn quiet" disabled={busy !== null} onClick={() => void run('archive')}>
            {busy === 'archive' ? <Loader2 className="spin" size={18} /> : <Archive size={18} />} {t('remove.archive')}
          </button>
          <p className="meta">{t('remove.archive.hint')}</p>
          <button type="button" className="tz-btn danger" onClick={() => setConfirming(true)}><Trash2 size={18} /> {t('remove.delete')}</button>
          <p className="meta">{t('remove.delete.hint')}</p>
        </>
      ) : (
        <>
          <p className="lead" style={{ fontWeight: 700 }}>{t('remove.sure')}</p>
          <p className="dim">{n ? t('remove.sure.body', { n }) : t('remove.sure.body0')}</p>
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="tz-btn danger" disabled={busy !== null} onClick={() => void run('delete')}>
              {busy === 'delete' ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />} {t('remove.delete.yes')}
            </button>
            <button type="button" className="tz-btn ghost" disabled={busy !== null} onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
          </div>
        </>
      )}
    </Sheet>
  )
}
