// TREZURE · clean
// Input: { job_id } for an image_jobs row of type 'clean'. Loads the original from Storage, asks the
// segmentation provider for a transparent cutout (PNG with alpha), trims it to the alpha bounding box
// with a small margin so every item later sits in the same proportion, uploads `<img>-clean.png` plus a
// 480px `<img>-clean-t.png` for lists, and writes item_images.path_clean (the thumb path is by convention). The original is never touched. Any failure marks the job 'error' and
// leaves the item exactly as it was; the app keeps showing the original.
//
// Provider is one env var away (CLEAN_PROVIDER). Today: 'replicate' with 851-labs/background-remover
// (transparent-background / InSPyReNet, MIT). The key is per workspace, from `secrets` (key 'replicate').
import { createClient } from 'npm:@supabase/supabase-js@2'
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const PROVIDER = Deno.env.get('CLEAN_PROVIDER') ?? 'replicate'
const MODEL = Deno.env.get('CLEAN_MODEL') ?? '851-labs/background-remover'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } })

// model version, resolved once per instance (CLEAN_MODEL may be "owner/name" or "owner/name:version")
let versionCache: { model: string; version: string } | null = null
async function resolveVersion(apiKey: string): Promise<string> {
  if (MODEL.includes(':')) return MODEL.split(':')[1]
  if (versionCache?.model === MODEL) return versionCache.version
  const r = await fetch(`https://api.replicate.com/v1/models/${MODEL}`, { headers: { Authorization: `Bearer ${apiKey}` } })
  const d = await r.json()
  const v = d?.latest_version?.id
  if (!r.ok || !v) throw new Error('replicate_model_' + (d?.status ?? r.status) + ': ' + (d?.detail ?? 'no latest_version'))
  versionCache = { model: MODEL, version: v }
  return v
}

/** Replicate: run the model synchronously (Prefer: wait), poll if it is still running, return the output PNG bytes.
 *  429 (low credit accounts get 6 requests a minute) is retried with the server's own wait, up to 8 times. */
async function replicateCutout(apiKey: string, imageUrl: string): Promise<{ bytes: Uint8Array; meta: Record<string, unknown> }> {
  const t0 = Date.now()
  const version = await resolveVersion(apiKey)
  const headers = { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}`, Prefer: 'wait=60' }
  let pred: any = null
  let retries = 0
  for (let attempt = 0; attempt < 9; attempt++) {
    const r = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST', headers,
      body: JSON.stringify({ version, input: { image: imageUrl, format: 'png', background_type: 'rgba', threshold: 0 } }),
    })
    pred = await r.json()
    if (r.ok) break
    if (r.status === 429 && attempt < 8) {
      const ra = Number(r.headers.get('retry-after'))
      const m = String(pred?.detail ?? '').match(/~?(\d+)s/)
      const wait = (ra > 0 ? ra : m ? Number(m[1]) : 10) * 1000 + 1500 + Math.random() * 1500
      retries++
      await new Promise(res => setTimeout(res, Math.min(wait, 20000)))
      continue
    }
    throw new Error('replicate_' + (pred?.status ?? r.status) + ': ' + (pred?.detail ?? pred?.title ?? JSON.stringify(pred).slice(0, 200)))
  }
  // still running after the wait window: poll
  for (let i = 0; i < 40 && (pred.status === 'starting' || pred.status === 'processing'); i++) {
    await new Promise(res => setTimeout(res, 1500))
    const p = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${apiKey}` } })
    pred = await p.json()
  }
  if (pred.status !== 'succeeded') throw new Error('replicate_' + pred.status + ': ' + (pred.error ?? ''))
  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output
  if (typeof out !== 'string') throw new Error('replicate_no_output')
  const o = await fetch(out)
  if (!o.ok) throw new Error('replicate_output_fetch_' + o.status)
  return { bytes: new Uint8Array(await o.arrayBuffer()), meta: { provider: 'replicate', model: MODEL, version, prediction: pred.id, ms: Date.now() - t0, retries, predict_time: pred.metrics?.predict_time } }
}

/** Crops a transparent PNG to its alpha bounding box plus a margin. Returns the input unchanged if nothing is opaque. */
async function trimToAlpha(png: Uint8Array, margin = 0.03): Promise<{ bytes: Uint8Array; w: number; h: number; trimmed: boolean }> {
  const img = await Image.decode(png)
  const { width: W, height: H, bitmap } = img
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++) {
    const row = y * W * 4
    for (let x = 0; x < W; x++) {
      if (bitmap[row + x * 4 + 3] > 24) {
        if (x < x0) x0 = x; if (x > x1) x1 = x
        if (y < y0) y0 = y; if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return { bytes: png, w: W, h: H, trimmed: false }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  // a cutout that already fills the frame (less than 4% slack) is left alone
  if (bw > W * 0.96 && bh > H * 0.96) return { bytes: png, w: W, h: H, trimmed: false }
  const m = Math.round(Math.max(bw, bh) * margin)
  const cx0 = Math.max(0, x0 - m), cy0 = Math.max(0, y0 - m)
  const cx1 = Math.min(W - 1, x1 + m), cy1 = Math.min(H - 1, y1 + m)
  const cropped = img.crop(cx0, cy0, cx1 - cx0 + 1, cy1 - cy0 + 1)
  const bytes = await cropped.encode(6)
  return { bytes, w: cropped.width, h: cropped.height, trimmed: true }
}

/** 480px (longest side) PNG thumb of a cutout, for lists and grids. */
async function thumbOf(png: Uint8Array, max = 480): Promise<Uint8Array> {
  const img = await Image.decode(png)
  const s = Math.min(1, max / Math.max(img.width, img.height))
  if (s < 1) img.resize(Math.round(img.width * s), Math.round(img.height * s))
  return await img.encode(6)
}
const thumbPath = (cleanPath: string) => cleanPath.replace(/-clean\.png$/, '-clean-t.png')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } })
  const { data: userRes } = await userClient.auth.getUser()
  if (!userRes?.user) return json({ error: 'unauthorized' }, 401)

  let body: { job_id?: string }
  try { body = await req.json() } catch { return json({ error: 'bad_json' }, 400) }
  if (!body.job_id) return json({ error: 'job_id required' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: job } = await admin.from('image_jobs').select('*').eq('id', body.job_id).maybeSingle()
  if (!job) return json({ error: 'job_not_found' }, 404)
  if (job.type !== 'clean') return json({ error: 'wrong_job_type' }, 400)
  const { data: mem } = await admin.from('members').select('user_id').eq('workspace_id', job.workspace_id).eq('user_id', userRes.user.id).maybeSingle()
  if (!mem) return json({ error: 'forbidden' }, 403)
  if (job.status === 'done') return json({ ok: true, status: 'done' })

  await admin.from('image_jobs').update({ status: 'running' }).eq('id', job.id)
  const fail = async (code: string, detail?: string) => {
    await admin.from('image_jobs').update({ status: 'error', error: code, result: detail ? { detail: detail.slice(0, 600) } : null }).eq('id', job.id)
    return json({ ok: false, error: code, detail }, 200)
  }

  const { data: secret } = await admin.from('secrets').select('value').eq('workspace_id', job.workspace_id).eq('key', PROVIDER).maybeSingle()
  const apiKey = secret?.value?.trim()
  if (!apiKey) return fail('no_key')

  const { data: img } = await admin.from('item_images').select('*').eq('id', job.image_id).maybeSingle()
  if (!img) return fail('no_image')
  if (img.path_clean) {
    // already cut: only make sure the thumb exists
    const tp = thumbPath(img.path_clean)
    const probe = await fetch(`${SUPABASE_URL}/storage/v1/object/public/images/${tp}`, { method: 'HEAD' })
    if (!probe.ok) {
      const full = await fetch(`${SUPABASE_URL}/storage/v1/object/public/images/${img.path_clean}`)
      if (full.ok) {
        const t = await thumbOf(new Uint8Array(await full.arrayBuffer()))
        await admin.storage.from('images').upload(tp, t, { contentType: 'image/png', upsert: true, cacheControl: '31536000' })
      }
    }
    await admin.from('image_jobs').update({ status: 'done', result: { skipped: 'already_clean', thumb: !probe.ok ? 'made' : 'exists' } }).eq('id', job.id)
    return json({ ok: true, status: 'done' })
  }
  // another clean job for this image is in flight (two clients swept at once): do not pay twice
  const { data: inflight } = await admin.from('image_jobs').select('id').eq('image_id', img.id).eq('type', 'clean').eq('status', 'running').neq('id', job.id).gte('updated_at', new Date(Date.now() - 120_000).toISOString()).limit(1)
  if (inflight && inflight.length) { await admin.from('image_jobs').update({ status: 'done', result: { skipped: 'duplicate' } }).eq('id', job.id); return json({ ok: true, status: 'done', skipped: 'duplicate' }) }

  const imgUrl = `${SUPABASE_URL}/storage/v1/object/public/images/${img.path_original}`
  let cut: { bytes: Uint8Array; meta: Record<string, unknown> }
  try {
    if (PROVIDER === 'replicate') cut = await replicateCutout(apiKey, imgUrl)
    else return fail('unknown_provider', PROVIDER)
  } catch (e) { return fail('provider', String((e as Error)?.message ?? e)) }

  let trimmed: { bytes: Uint8Array; w: number; h: number; trimmed: boolean }
  try { trimmed = await trimToAlpha(cut.bytes) }
  catch (e) { trimmed = { bytes: cut.bytes, w: 0, h: 0, trimmed: false }; cut.meta.trim_error = String((e as Error)?.message ?? e) }

  const cleanPath = img.path_original.replace(/\.(webp|jpe?g|png)$/i, '') + '-clean.png'
  const up = await admin.storage.from('images').upload(cleanPath, trimmed.bytes, { contentType: 'image/png', upsert: true, cacheControl: '31536000' })
  if (up.error) return fail('upload', up.error.message)
  let thumbBytes = 0
  try {
    const t = await thumbOf(trimmed.bytes)
    const ut = await admin.storage.from('images').upload(thumbPath(cleanPath), t, { contentType: 'image/png', upsert: true, cacheControl: '31536000' })
    if (!ut.error) thumbBytes = t.byteLength
  } catch { /* the full cutout still works without a thumb */ }

  const { error: e1 } = await admin.from('item_images').update({ path_clean: cleanPath }).eq('id', img.id)
  if (e1) return fail('db', e1.message)
  const result = { ...cut.meta, trimmed: trimmed.trimmed, clean_w: trimmed.w, clean_h: trimmed.h, bytes: trimmed.bytes.byteLength, thumb_bytes: thumbBytes }
  await admin.from('image_jobs').update({ status: 'done', result, error: null }).eq('id', job.id)
  return json({ ok: true, status: 'done', path_clean: cleanPath, result })
})
