// TREZURE · vision
// Input: { job_id }. Loads the job, the image (public URL), the workspace categories and the
// workspace's Anthropic key from `secrets`, asks Claude for a JSON description, stores it on
// items.ai and marks the job done / needs_reshoot / error. Called from the app with the user's JWT.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const MODEL = Deno.env.get('VISION_MODEL') ?? 'claude-sonnet-4-5'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } })

interface Cat { id: string; name_he: string; name_en: string | null; parent_id: string | null; fields: { key: string; label_he: string; label_en: string; type: string; options?: string[]; unit?: string }[] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  // caller must be a signed-in user
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

  // the caller must belong to the job's workspace
  const { data: mem } = await admin.from('members').select('user_id').eq('workspace_id', job.workspace_id).eq('user_id', userRes.user.id).maybeSingle()
  if (!mem) return json({ error: 'forbidden' }, 403)
  if (job.status === 'done') return json({ ok: true, status: 'done' })

  await admin.from('image_jobs').update({ status: 'running' }).eq('id', job.id)

  const fail = async (code: string, detail?: string) => {
    await admin.from('image_jobs').update({ status: 'error', error: code, result: detail ? { detail } : null }).eq('id', job.id)
    return json({ ok: false, error: code, detail }, 200)
  }

  const { data: secret } = await admin.from('secrets').select('value').eq('workspace_id', job.workspace_id).eq('key', 'anthropic').maybeSingle()
  const apiKey = secret?.value?.trim()
  if (!apiKey) return fail('no_key')

  const { data: img } = await admin.from('item_images').select('*').eq('id', job.image_id).maybeSingle()
  if (!img) return fail('no_image')
  const { data: item } = await admin.from('items').select('*').eq('id', job.item_id).maybeSingle()
  if (!item) return fail('no_item')
  const { data: cats } = await admin.from('categories').select('id,name_he,name_en,parent_id,fields').eq('workspace_id', job.workspace_id)
  const categories = (cats ?? []) as Cat[]

  // fetch the image and send it inline (base64), works for private buckets too
  const imgUrl = `${SUPABASE_URL}/storage/v1/object/public/images/${img.path_original}`
  const imgRes = await fetch(imgUrl)
  if (!imgRes.ok) return fail('image_fetch', String(imgRes.status))
  const bytes = new Uint8Array(await imgRes.arrayBuffer())
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const b64 = btoa(bin)
  const mediaType = img.path_original.endsWith('.webp') ? 'image/webp' : img.path_original.endsWith('.png') ? 'image/png' : 'image/jpeg'

  const catList = categories.map(c => {
    const parent = c.parent_id ? categories.find(p => p.id === c.parent_id) : null
    const label = parent ? `${parent.name_he} / ${c.name_he}` : c.name_he
    const fields = (c.fields ?? []).map(f => `${f.key}${f.type === 'select' && f.options ? ` [${f.options.join('|')}]` : f.type === 'number' ? ' (number' + (f.unit ? ', ' + f.unit : '') + ')' : ''}`).join(', ')
    return `- id=${c.id} · ${label}${c.name_en ? ` (${c.name_en})` : ''}${fields ? ` · fields: ${fields}` : ''}`
  }).join('\n')

  const prompt = `You are OKI, the cataloguing assistant of TREZURE, a home and small business equipment inventory.
Look at the photo of ONE item and return ONLY a JSON object, no prose, no markdown fences.

Categories available (choose the most specific id, or null if none fits):
${catList}

Return exactly this shape:
{
  "name_he": string | null,        // short Hebrew name, 2 to 6 words, the way a person would label it (brand not included)
  "name_en": string | null,        // same in English
  "brand": string | null,          // brand or manufacturer if visible or obvious, else null
  "category_id": string | null,    // one of the ids above
  "attrs": { },                    // keys from that category's fields only. Values as strings or numbers. Omit unknown keys.
  "qty_guess": number | null,      // how many units are visible, 1 if a single item
  "unit": "unit"|"pack"|"roll"|"m"|"cm"|"ml"|"sheet"|"set"|"pair"|"box"|null,
  "barcode_digits": string | null, // digits if a barcode is legible
  "is_branded_product": boolean,   // a retail product with packaging vs a loose object
  "confidence": number,            // 0..1 overall
  "field_confidence": { "name": number, "brand": number, "category_id": number },
  "needs_reshoot": null | { "angle": "front"|"side"|"back"|"detail", "reason_he": string, "reason_en": string }
}
Rules: Hebrew text in Hebrew letters. No exclamation marks. If the photo is blurry, too dark, or the label faces away so you cannot name it, set needs_reshoot with a one sentence reason and keep confidence under 0.4. Keep "name_he" short and concrete (e.g. "ויניל כסף מטאלי", "משחק קופסה Catan").`

  let aiText = ''
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 800, temperature: 0,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: prompt },
        ] }],
      }),
    })
    const data = await r.json()
    if (!r.ok) return fail('anthropic_' + (data?.error?.type ?? r.status), data?.error?.message)
    aiText = (data.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('')
  } catch (e) { return fail('anthropic_network', String(e)) }

  let ai: Record<string, unknown>
  try {
    const m = aiText.match(/\{[\s\S]*\}/)
    ai = JSON.parse(m ? m[0] : aiText)
  } catch { return fail('bad_ai_json', aiText.slice(0, 500)) }

  // sanity: category must exist
  if (ai.category_id && !categories.some(c => c.id === ai.category_id)) ai.category_id = null
  ai.model = MODEL
  const confidence = Number(ai.confidence ?? 0)
  const reshoot = ai.needs_reshoot && typeof ai.needs_reshoot === 'object'

  const patch: Record<string, unknown> = { ai }
  if (!reshoot && confidence >= 0.85) {
    if (!item.name && ai.name_he) patch.name = ai.name_he
    if (!item.brand && ai.brand) patch.brand = ai.brand
    if (!item.category_id && ai.category_id) patch.category_id = ai.category_id
    if (ai.attrs && typeof ai.attrs === 'object') patch.attrs = { ...(ai.attrs as object), ...(item.attrs ?? {}) }
    if (ai.unit && typeof ai.unit === 'string' && item.unit === 'unit') patch.unit = ai.unit
    if (ai.barcode_digits && !item.barcode) patch.barcode = ai.barcode_digits
  }
  await admin.from('items').update(patch).eq('id', item.id)
  await admin.from('image_jobs').update({ status: reshoot ? 'needs_reshoot' : 'done', result: ai, error: null }).eq('id', job.id)
  return json({ ok: true, status: reshoot ? 'needs_reshoot' : 'done', ai })
})
