export type Kind = 'equipment' | 'consumable' | 'kit'
export type StockState = 'full' | 'low' | 'empty'
export type Stage = 'inbox' | 'ready'

export interface Workspace { id: string; name: string; kind: string; locale: string; created_by: string | null }
export interface Member { workspace_id: string; user_id: string; role: 'owner' | 'admin' | 'editor' | 'viewer'; perms: Record<string, unknown> }

export interface Location {
  id: string; workspace_id: string; parent_id: string | null
  kind: 'site' | 'room' | 'cabinet' | 'shelf' | 'box' | 'drawer' | 'other'
  name: string; code: string; color: string | null; sort: number; photo_path: string | null; path: string | null
}

export interface FieldDef {
  key: string
  label_he: string
  label_en: string
  type: 'text' | 'number' | 'select'
  options?: string[]
  unit?: string
}

export interface Category {
  id: string; workspace_id: string; parent_id: string | null
  name_he: string; name_en: string | null; icon: string | null
  default_unit: string; default_kind: 'equipment' | 'consumable'
  fields: FieldDef[]; sort: number
}

export interface AiResult {
  name_he?: string | null
  name_en?: string | null
  brand?: string | null
  category_id?: string | null
  attrs?: Record<string, string | number | null>
  qty_guess?: number | null
  unit?: string | null
  barcode_digits?: string | null
  is_branded_product?: boolean
  confidence?: number
  field_confidence?: Record<string, number>
  needs_reshoot?: { angle: string; reason_he: string; reason_en?: string } | null
  model?: string
  error?: string
}

export interface Item {
  id: string; workspace_id: string
  name: string | null; brand: string | null
  category_id: string | null; location_id: string | null
  qty: number; unit: string; kind: Kind
  stock_state: StockState; min_qty: number | null
  condition: string | null; barcode: string | null; tags: string[]
  attrs: Record<string, string | number | null>; notes: string | null
  price: number | null; currency: string | null
  cover_image_id: string | null; stage: Stage; ai: AiResult | null
  created_by: string | null; created_at: string; updated_at: string; archived_at: string | null
}

export interface ItemImage {
  id: string; workspace_id: string; item_id: string
  path_original: string; path_clean: string | null; path_thumb: string | null
  source: string; angle: string; sort: number; width: number | null; height: number | null; created_at: string
}

export interface ImageJob {
  id: string; workspace_id: string; item_id: string | null; image_id: string | null
  type: string; status: 'pending' | 'running' | 'done' | 'error' | 'needs_reshoot'
  request: unknown; result: unknown; error: string | null; created_at: string; updated_at: string
}

export interface ItemWithImages extends Item { item_images: ItemImage[]; image_jobs?: ImageJob[] }
