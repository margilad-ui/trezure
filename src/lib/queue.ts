/** Offline capture queue in IndexedDB. Each shot is stored until uploaded. */
import { get, set, del, keys, createStore } from 'idb-keyval'
import { supabase } from './supabase'
import { useSyncExternalStore } from 'react'

const store = createStore('trezure', 'queue')

export interface QueuedShot {
  id: string
  ws: string
  blob: Blob
  thumb: Blob
  width: number
  height: number
  location_id: string
  qty: number
  /** client generated item id. A 'front' shot creates the item; other angles attach to it. */
  item_id: string
  angle: 'front' | 'side' | 'back' | 'detail'
  created_at: string
  tries: number
  error?: string
}

const listeners = new Set<() => void>()
let snapshot = { pending: 0, uploading: false }
function emit() { listeners.forEach(f => f()) }

export function useQueue() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => snapshot)
}

async function refreshCount() {
  const k = await keys(store)
  snapshot = { ...snapshot, pending: k.length }
  emit()
}

export async function enqueue(shot: Omit<QueuedShot, 'id' | 'created_at' | 'tries'>): Promise<QueuedShot> {
  const q: QueuedShot = { ...shot, id: crypto.randomUUID(), created_at: new Date().toISOString(), tries: 0 }
  await set(q.id, q, store)
  await refreshCount()
  void flush()
  return q
}

export async function listQueue(): Promise<QueuedShot[]> {
  const k = await keys(store)
  const all = await Promise.all(k.map(id => get<QueuedShot>(id as string, store)))
  return all.filter(Boolean).sort((a, b) => a!.created_at.localeCompare(b!.created_at)) as QueuedShot[]
}

let flushing = false
/** Uploads everything in the queue, in order. Safe to call often. */
export async function flush(): Promise<void> {
  if (flushing || !navigator.onLine) return
  flushing = true
  snapshot = { ...snapshot, uploading: true }; emit()
  try {
    const items = await listQueue()
    for (const q of items) {
      try {
        await uploadOne(q)
        await del(q.id, store)
      } catch (e) {
        q.tries += 1
        q.error = String((e as Error)?.message || e)
        await set(q.id, q, store)
        if (q.tries >= 3) { /* leave it; UI shows the error */ }
      }
      await refreshCount()
    }
  } finally {
    flushing = false
    snapshot = { ...snapshot, uploading: false }; emit()
  }
}

async function uploadOne(q: QueuedShot) {
  const itemId = q.item_id
  const isNew = q.angle === 'front'
  if (isNew) {
    const { error } = await supabase.from('items')
      .upsert({ id: itemId, workspace_id: q.ws, location_id: q.location_id, qty: q.qty, stage: 'inbox' }, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
  }
  const imgId = crypto.randomUUID()
  const base = `${q.ws}/${itemId}/${imgId}`
  const up1 = await supabase.storage.from('images').upload(`${base}.webp`, q.blob, { contentType: 'image/webp', upsert: false })
  if (up1.error) throw up1.error
  const up2 = await supabase.storage.from('images').upload(`${base}-t.webp`, q.thumb, { contentType: 'image/webp', upsert: false })
  if (up2.error) throw up2.error
  const { error: e3 } = await supabase.from('item_images').insert({
    id: imgId, workspace_id: q.ws, item_id: itemId, path_original: `${base}.webp`, path_thumb: `${base}-t.webp`,
    source: 'camera', angle: q.angle, width: q.width, height: q.height, sort: isNew ? 0 : 1,
  })
  if (e3) throw e3
  if (isNew) await supabase.from('items').update({ cover_image_id: imgId }).eq('id', itemId)
  // analysis job, only for the first (front) image
  if (isNew) {
    const { data: job, error: e4 } = await supabase.from('image_jobs')
      .insert({ workspace_id: q.ws, item_id: itemId, image_id: imgId, type: 'analyze', status: 'pending' })
      .select('id').single()
    if (e4) throw e4
    // fire and forget; the inbox polls job status
    void supabase.functions.invoke('vision', { body: { job_id: job.id } }).catch(() => {})
  }
}

window.addEventListener('online', () => { void flush() })
void refreshCount()
