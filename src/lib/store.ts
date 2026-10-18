/** Session, workspace and reference data (locations, categories). One small external store. */
import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Category, Location, Workspace } from './types'
import { CATEGORIES, SITES } from './seed'
import { getLang } from '../i18n'

export interface State {
  ready: boolean
  session: Session | null
  workspace: Workspace | null
  locations: Location[]
  categories: Category[]
  hasKey: boolean
  hasCleanKey: boolean
}

let state: State = { ready: false, session: null, workspace: null, locations: [], categories: [], hasKey: false, hasCleanKey: false }
const listeners = new Set<() => void>()
function set(p: Partial<State>) { state = { ...state, ...p }; listeners.forEach(f => f()) }

export function useStore(): State {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => state)
}
export function getState() { return state }

const LS_WS = 'tz.ws'

export async function boot() {
  const { data } = await supabase.auth.getSession()
  await applySession(data.session)
  supabase.auth.onAuthStateChange((_e, s) => { void applySession(s) })
}

async function applySession(session: Session | null) {
  if (!session) { set({ ready: true, session: null, workspace: null, locations: [], categories: [], hasKey: false, hasCleanKey: false }); return }
  set({ session })
  await loadWorkspace()
  set({ ready: true })
}

export async function loadWorkspace() {
  const { data: wss } = await supabase.from('workspaces').select('*').order('created_at')
  if (!wss || wss.length === 0) { set({ workspace: null, locations: [], categories: [] }); return }
  let pick = wss[0] as Workspace
  try { const saved = localStorage.getItem(LS_WS); const found = wss.find(w => w.id === saved); if (found) pick = found as Workspace } catch { /* ignore */ }
  await selectWorkspace(pick)
}

export async function selectWorkspace(ws: Workspace) {
  try { localStorage.setItem(LS_WS, ws.id) } catch { /* ignore */ }
  set({ workspace: ws })
  await refreshRefs()
}

export async function refreshRefs() {
  const ws = state.workspace; if (!ws) return
  const [{ data: locs }, { data: cats }, { data: key }, { data: ckey }] = await Promise.all([
    supabase.from('locations').select('*').eq('workspace_id', ws.id).order('sort').order('name'),
    supabase.from('categories').select('*').eq('workspace_id', ws.id).order('sort').order('name_he'),
    supabase.rpc('has_secret', { ws: ws.id, k: 'anthropic' }),
    supabase.rpc('has_secret', { ws: ws.id, k: 'replicate' }),
  ])
  set({ locations: (locs ?? []) as Location[], categories: (cats ?? []) as Category[], hasKey: Boolean(key), hasCleanKey: Boolean(ckey) })
}

/** Creates the first workspace with sites and categories. */
export async function createWorkspaceWithSeed(name: string) {
  const { data: wsId, error } = await supabase.rpc('create_workspace', { p_name: name, p_kind: 'home', p_locale: getLang() })
  if (error) throw error
  const ws = wsId as string
  const lang = getLang()
  const { error: e1 } = await supabase.from('locations').insert(SITES.map((s, i) => ({
    workspace_id: ws, kind: 'site', name: lang === 'he' ? s.name_he : s.name_en, code: s.code, color: s.color, sort: i, path: s.code,
  })))
  if (e1) throw e1
  let sort = 0
  for (const c of CATEGORIES) {
    const { data: parent, error: e2 } = await supabase.from('categories').insert({
      workspace_id: ws, name_he: c.name_he, name_en: c.name_en, icon: c.icon, color: c.color ?? null, default_unit: c.default_unit, default_kind: c.default_kind, fields: c.fields, sort: sort++,
    }).select('id').single()
    if (e2) throw e2
    if (c.children?.length) {
      const { error: e3 } = await supabase.from('categories').insert(c.children.map(ch => ({
        workspace_id: ws, parent_id: parent.id, name_he: ch.name_he, name_en: ch.name_en, icon: ch.icon, default_unit: ch.default_unit, default_kind: ch.default_kind, fields: ch.fields, sort: sort++,
      })))
      if (e3) throw e3
    }
  }
  await supabase.from('settings').insert([
    { workspace_id: ws, key: 'lang', value: lang },
    { workspace_id: ws, key: 'sounds', value: { capture: true, found: true } },
  ])
  await loadWorkspace()
}

/** Creates a category and refreshes the reference lists. Returns its id. */
export async function createCategory(input: {
  workspace_id: string; name_he: string; name_en?: string | null; parent_id?: string | null
  default_unit?: string; default_kind?: 'equipment' | 'consumable'
}): Promise<string> {
  const sort = state.categories.length + 1
  const { data, error } = await supabase.from('categories').insert({
    workspace_id: input.workspace_id, name_he: input.name_he, name_en: input.name_en ?? null,
    parent_id: input.parent_id ?? null, default_unit: input.default_unit ?? 'unit',
    default_kind: input.default_kind ?? 'equipment', fields: [], sort,
  }).select('id').single()
  if (error) throw error
  await refreshRefs()
  return data.id as string
}

export async function signOut() {
  await supabase.auth.signOut()
  try { localStorage.removeItem(LS_WS) } catch { /* ignore */ }
}

export function catName(c: Category | undefined | null): string {
  if (!c) return ''
  return getLang() === 'en' && c.name_en ? c.name_en : c.name_he
}
export function catById(id: string | null | undefined): Category | undefined {
  return state.categories.find(c => c.id === id)
}
/** Tint for the clean item display: the category's color, else its parent's, else a stable hue from the id. */
export function catColor(id: string | null | undefined): string {
  const c = catById(id)
  if (c?.color) return c.color
  const p = c?.parent_id ? catById(c.parent_id) : undefined
  if (p?.color) return p.color
  if (!id) return '#9CA3AF'
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return `oklch(62% 0.12 ${h % 360})`
}
export function locById(id: string | null | undefined): Location | undefined {
  return state.locations.find(l => l.id === id)
}
/** Full label for a location: "משרד · ארון 3". Sites alone show just the name. */
export function locLabel(id: string | null | undefined): string {
  const l = locById(id); if (!l) return ''
  const parts: string[] = [l.name?.trim() || l.code]
  let p = l.parent_id ? locById(l.parent_id) : undefined
  while (p) { parts.unshift(p.name?.trim() || p.code); p = p.parent_id ? locById(p.parent_id) : undefined }
  return parts.join(' · ')
}
export function locColor(id: string | null | undefined): string {
  let l = locById(id)
  while (l && !l.color && l.parent_id) l = locById(l.parent_id)
  return l?.color || '#1EA5A0'
}

/** A location and every place inside it, so "the shed" also finds what sits in a box on a shelf in the shed. */
export function locSubtree(id: string): string[] {
  const out: string[] = [id]
  for (let i = 0; i < out.length; i++) for (const l of state.locations) if (l.parent_id === out[i]) out.push(l.id)
  return out
}

/** What a label for this place says: the kind in words for the bar, the parent line (not for boxes, which
 *  move), and a line to write on when a box has no name yet. */
export function locLabelData(l: { id: string; kind: string; name: string; code: string; parent_id: string | null }, kindWord: string, url: string) {
  const box = l.kind === 'box'
  const parent = !box && l.parent_id ? locLabel(l.parent_id) : ''
  return { name: l.name?.trim() || '', code: l.code, url, parent, kindLabel: kindWord, writeLine: box && !l.name?.trim() }
}
