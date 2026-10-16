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

export async function archiveItem(item: Item) {
  const { error } = await supabase.from('items').update({ archived_at: new Date().toISOString() }).eq('id', item.id)
  if (error) throw error
  await supabase.from('activity').insert({ workspace_id: item.workspace_id, item_id: item.id, action: 'archive' })
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

export async function saveSecret(ws: string, key: string, value: string) {
  const { error } = await supabase.rpc('set_secret', { ws, k: key, v: value })
  if (error) throw error
}
