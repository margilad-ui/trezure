import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
export const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})

export function publicUrl(bucket: string, path: string | null | undefined): string {
  if (!path) return ''
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

/** Image transform URL when available (Pro has image transforms); falls back to the original. */
export function imgUrl(path: string | null | undefined, width = 320): string {
  if (!path) return ''
  return `${SUPABASE_URL}/storage/v1/render/image/public/images/${path}?width=${width}&quality=80`
}
