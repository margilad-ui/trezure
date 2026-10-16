import { supabase } from './supabase'
import type { Item, ItemWithImages, Kind, StockState } from './types'

const ITEM_COLS = '*, item_images(*), item_categories(category_id), image_jobs(id,status,error,type,updated_at)'

export async function fetchInbox(ws: string): Promise<ItemWithImages[]> {
  const { data, error } = await supabase.from('items').select(ITEM_COLS)
    .eq('workspace_id', ws).eq('stage', 'inbox').is('archived_at', null)
    .order('created_at', { ascending: false }).limit(300)
  if (error) throw error
  return (data ?? []) as unknown as ItemWithImages[]
}

/** How many items are still sitting in sort. Head request, no rows transferred. */
export async function inboxCount(ws: string): Promise<number> {
  const { count, error } = await supabase.from('items').select('id', { count: 'exact', head: true })
    .eq('workspace_id', ws).eq('stage', 'inbox').is('archived_at', null)
  if (error) throw error
  return count ?? 0
}

/** Distinct tags already used in this workspace, for autocomplete. */
export async function workspaceTags(ws: string): Promise<string[]> {
  const { data, error } = await supabase.from('items').select('tags')
    .eq('workspace_id', ws).is('archived_at', null).not('tags', 'eq', '{}').limit(1000)
  if (error) throw error
  const s = new Set<string>()
  for (const row of data ?? []) for (const tag of (row as { tags: string[] }).tags ?? []) s.add(tag)
  return Array.from(s).sort()
}

export interface SearchFilters {
  q?: string
  category_id?: string | null
  location_id?: string | null
  kind?: Kind | null
  stock?: StockState | null
  tag?: string | null
  inbox?: boolean
}

export async function searchItems(ws: string, f: SearchFilters): Promise<ItemWithImages[]> {
  let qb = supabase.from('items').select('*, item_images(*), item_categories(category_id)').eq('workspace_id', ws).is('archived_at', null)
  if (f.inbox) qb = qb.eq('stage', 'inbox'); else qb = qb.eq('stage', 'ready')
  if (f.category_id) qb = qb.contains('category_ids', [f.category_id])
  if (f.location_id) qb = qb.eq('location_id', f.location_id)
  if (f.kind) qb = qb.eq('kind', f.kind)
  if (f.stock) qb = qb.eq('stock_state', f.stock)
  if (f.tag) qb = qb.contains('tags', [f.tag])
  const q = (f.q || '').trim()
  if (q) {
    const safe = q.replace(/[%_,()]/g, ' ').trim()
    const words = safe.split(/\s+/).filter(Boolean)
    if (words.length) {
      // full text (prefix) OR ilike on name/brand, so partial Hebrew words still hit
      const ts = words.map(w => `${w}:*`).join(' & ')
      qb = qb.or(`search.wfts(simple).${ts},name.ilike.%${safe}%,brand.ilike.%${safe}%`)
    }
  }
  const { data, error } = await qb.order('updated_at', { ascending: false }).limit(200)
  if (error) throw error
  return (data ?? []) as unknown as ItemWithImages[]
}

export async function fetchItem(id: string): Promise<ItemWithImages | null> {
  const { data, error } = await supabase.from('items').select(ITEM_COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as ItemWithImages | null
}

/** Replaces the item's additional categories. The primary one stays on items.category_id. */
export async function setItemCategories(itemId: string, ws: string, ids: string[]) {
  const { error: delErr } = await supabase.from('item_categories').delete().eq('item_id', itemId)
  if (delErr) throw delErr
  const clean = Array.from(new Set(ids)).filter(Boolean)
  if (!clean.length) return
  const { error } = await supabase.from('item_categories').insert(clean.map(category_id => ({ item_id: itemId, category_id, workspace_id: ws })))
  if (error) throw error
}

export async function updateItem(id: string, patch: Partial<Item>) {
  const { error } = await supabase.from('items').update(patch).eq('id', id)
  if (error) throw error
}

export async function approveItem(item: Item, patch: Partial<Item>) {
  const { error } = await supabase.from('items').update({ ...patch, stage: 'ready' }).eq('id', item.id)
  if (error) throw error
  await supabase.from('activity').insert({ workspace_id: item.workspace_id, item_id: item.id, action: 'create', diff: patch })
}

export interface ActivityRow { id: number; item_id: string | null; user_id: string | null; action: string; diff: Record<string, unknown> | null; created_at: string }

/** The item's own timeline, newest first. */
export async function fetchActivity(itemId: string, limit = 40): Promise<ActivityRow[]> {
  const { data, error } = await supabase.from('activity').select('*').eq('item_id', itemId).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as ActivityRow[]
}

/** Explicit move, logged with where it came from so the history reads like a sentence. */
export async function moveItem(item: Item, locationId: string) {
  if (item.location_id === locationId) return
  const { error } = await supabase.from('items').update({ location_id: locationId }).eq('id', item.id)
  if (error) throw error
  await supabase.from('activity').insert({ workspace_id: item.workspace_id, item_id: item.id, action: 'move', diff: { from: item.location_id, to: locationId } })
}

export async function setCoverImage(item: Item, imageId: string) {
  const { error } = await supabase.from('items').update({ cover_image_id: imageId }).eq('id', item.id)
  if (error) throw error
}

/**
 * A second item just like this one, somewhere else, without shooting it again. The copy points at the same
 * Storage files (the image rows are new, the paths are shared), so deleting one twin leaves the other intact:
 * deleteItem only removes a file no other image row still references.
 */
export async function duplicateItem(item: ItemWithImages, locationId: string | null): Promise<string> {
  const id = crypto.randomUUID()
  const { error } = await supabase.from('items').insert({
    id, workspace_id: item.workspace_id, name: item.name, brand: item.brand, category_id: item.category_id,
    location_id: locationId ?? item.location_id, qty: 1, unit: item.unit, kind: item.kind, min_qty: item.min_qty,
    condition: item.condition, barcode: item.barcode, tags: item.tags, attrs: item.attrs, notes: item.notes,
    price: item.price, currency: item.currency, stage: 'ready', ai: item.ai,
  })
  if (error) throw error
  const imgs = (item.item_images ?? []).slice().sort((a, b) => a.sort - b.sort)
  if (imgs.length) {
    const rows = imgs.map(im => ({ id: crypto.randomUUID(), workspace_id: item.workspace_id, item_id: id, path_original: im.path_original, path_clean: im.path_clean, path_thumb: im.path_thumb, source: im.source, angle: im.angle, width: im.width, height: im.height, sort: im.sort }))
    const { error: e2 } = await supabase.from('item_images').insert(rows)
    if (!e2) await supabase.from('items').update({ cover_image_id: rows[0].id }).eq('id', id)
  }
  const cats = (item.item_categories ?? []).map(c => c.category_id).filter(c => c !== item.category_id)
  if (cats.length) await setItemCategories(id, item.workspace_id, cats)
  await supabase.from('activity').insert({ workspace_id: item.workspace_id, item_id: id, action: 'duplicate', diff: { from: item.id } })
  return id
}

/** Puts an approved item back in the sort queue. The mirror of approveItem, for undo. */
export async function unapproveItem(item: Item) {
  const { error } = await supabase.from('items').update({ stage: 'inbox' }).eq('id', item.id)
  if (error) throw error
}

export async function unarchiveItem(item: Item) {
  const { error } = await supabase.from('items').update({ archived_at: null }).eq('id', item.id)
  if (error) throw error
}

export async function archiveItem(item: Item) {
  const { error } = await supabase.from('items').update({ archived_at: new Date().toISOString() }).eq('id', item.id)
  if (error) throw error
  await supabase.from('activity').insert({ workspace_id: item.workspace_id, item_id: item.id, action: 'archive' })
}

/**
 * Permanent delete: removes the image files from Storage, then the item row (item_images, image_jobs and
 * item_categories cascade). The activity row stays as the audit trail. Needs the can_delete permission.
 */
export async function deleteItem(item: ItemWithImages): Promise<void> {
  const paths: string[] = []
  for (const im of item.item_images ?? []) {
    paths.push(im.path_original)
    if (im.path_thumb) paths.push(im.path_thumb)
    if (im.path_clean) { paths.push(im.path_clean); paths.push(im.path_clean.replace(/-clean\.png$/, '-clean-t.png')) }
  }
  // a duplicate shares the same files: only remove what no other image row references
  let removable = paths
  if (paths.length) {
    const ids = (item.item_images ?? []).map(im => im.id)
    const { data: others } = await supabase.from('item_images').select('path_original,path_thumb,path_clean').eq('workspace_id', item.workspace_id).not('id', 'in', `(${ids.join(',')})`).in('path_original', (item.item_images ?? []).map(im => im.path_original))
    const shared = new Set<string>()
    for (const o of (others ?? []) as { path_original: string; path_thumb: string | null; path_clean: string | null }[]) {
      shared.add(o.path_original)
      if (o.path_thumb) shared.add(o.path_thumb)
      if (o.path_clean) { shared.add(o.path_clean); shared.add(o.path_clean.replace(/-clean\.png$/, '-clean-t.png')) }
    }
    removable = paths.filter(p => !shared.has(p))
  }
  if (removable.length) await supabase.storage.from('images').remove(removable).catch(() => {})
  const { error } = await supabase.from('items').delete().eq('id', item.id)
  if (error) throw error
  await supabase.from('activity').insert({ workspace_id: item.workspace_id, action: 'delete', diff: { item_id: item.id, name: item.name, files: removable.length } })
}

export async function adjustQty(id: string, delta: number): Promise<number> {
  const { data, error } = await supabase.rpc('adjust_qty', { item: id, delta })
  if (error) throw error
  return Number(data)
}

export async function requestAnalysis(item: ItemWithImages) {
  const img = item.item_images?.slice().sort((a, b) => a.sort - b.sort)[0]
  if (!img) return
  const { data: job, error } = await supabase.from('image_jobs')
    .insert({ workspace_id: item.workspace_id, item_id: item.id, image_id: img.id, type: 'analyze', status: 'pending' })
    .select('id').single()
  if (error) throw error
  await supabase.functions.invoke('vision', { body: { job_id: job.id } })
}

/** Queues a background cleanup for one image and fires the function. Never throws: cleanup failing must not touch the item. */
export async function requestClean(ws: string, itemId: string, imageId: string, wait = false) {
  try {
    const { data: job, error } = await supabase.from('image_jobs')
      .insert({ workspace_id: ws, item_id: itemId, image_id: imageId, type: 'clean', status: 'pending' })
      .select('id').single()
    if (error || !job) return
    const call = supabase.functions.invoke('clean', { body: { job_id: job.id } }).catch(() => {})
    if (wait) await call; else void call
  } catch { /* ignore */ }
}

/** Sends every image without a clean cutout to cleanup (after a key is saved, or on demand), one at a time so a
 *  rate limited account is not hammered. Returns how many were queued; runs in the background after the first. */
export async function cleanMissing(ws: string, limit = 200): Promise<number> {
  const { data } = await supabase.from('item_images').select('id,item_id').eq('workspace_id', ws).is('path_clean', null).order('created_at', { ascending: false }).limit(limit)
  let rows = (data ?? []) as { id: string; item_id: string }[]
  if (!rows.length) return 0
  // skip images with a clean job already in flight (last 3 minutes)
  const since = new Date(Date.now() - 3 * 60_000).toISOString()
  const { data: busy } = await supabase.from('image_jobs').select('image_id').eq('workspace_id', ws).eq('type', 'clean').in('status', ['pending', 'running']).gte('updated_at', since)
  const busySet = new Set((busy ?? []).map(b => (b as { image_id: string }).image_id))
  rows = rows.filter(r => !busySet.has(r.id))
  void (async () => { for (const r of rows) await requestClean(ws, r.item_id, r.id, true) })()
  return rows.length
}

/** One-off: asks the function to make list thumbs for cutouts made before thumbs existed (it only uploads what is missing). */
export async function ensureCleanThumbs(ws: string): Promise<void> {
  const { data } = await supabase.from('item_images').select('id,item_id').eq('workspace_id', ws).not('path_clean', 'is', null).limit(500)
  for (const r of (data ?? []) as { id: string; item_id: string }[]) await requestClean(ws, r.item_id, r.id, true)
}

/** How many live items sit directly in each location. Rolling up to parents is done in the screen. */
export async function locationCounts(ws: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('items').select('location_id').eq('workspace_id', ws).is('archived_at', null).limit(5000)
  if (error) throw error
  const out: Record<string, number> = {}
  for (const r of (data ?? []) as { location_id: string | null }[]) if (r.location_id) out[r.location_id] = (out[r.location_id] ?? 0) + 1
  return out
}

/** Creates a location under a parent. The code is derived from the parent so labels stay readable: OF-03-02. */
export async function createLocation(ws: string, parentId: string | null, name: string, kind: string, parentCode?: string, siblings = 0): Promise<string> {
  const code = parentCode ? `${parentCode}-${String(siblings + 1).padStart(2, '0')}` : name.slice(0, 2).toUpperCase()
  const { data, error } = await supabase.from('locations').insert({ workspace_id: ws, parent_id: parentId, name: name.trim(), kind, code, sort: siblings }).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function updateLocation(id: string, patch: { name?: string; kind?: string; color?: string | null; code?: string; photo_path?: string | null }) {
  const { error } = await supabase.from('locations').update(patch).eq('id', id)
  if (error) throw error
}

/** A photo of the whole shelf, so the place is recognised by sight and not only by its code. */
export async function uploadLocationPhoto(ws: string, locId: string, blob: Blob): Promise<string> {
  const path = `${ws}/loc/${locId}-${Date.now()}.webp`
  const up = await supabase.storage.from('images').upload(path, blob, { contentType: 'image/webp', upsert: true })
  if (up.error) throw up.error
  await updateLocation(locId, { photo_path: path })
  return path
}

export async function saveSecret(ws: string, key: string, value: string) {
  const { error } = await supabase.rpc('set_secret', { ws, k: key, v: value })
  if (error) throw error
}
