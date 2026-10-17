// TREZURE · match
// Input: { item_id }. Layer 1 runs in the database (refresh_matches: name trigrams, brand, category, tags,
// barcode). Layer 2 runs here, only for candidates OKI has not judged yet: one Claude call with this item's
// photo and up to three candidates' photos, answering same / family / unrelated with one dry sentence.
// Called by `vision` right after an analysis, and by the app (sort screen, duplicates screen) with the user's JWT.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const MODEL = Deno.env.get('VISION_MODEL') ?? 'claude-sonnet-4-5'
const MAX_JUDGE = 3

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } })

interface Pair { item_a: string; item_b: string; score: number; signals: Record<string, unknown>; verdict: string | null; decision: string | null }
interface Img { item_id: string; path_original: string; path_clean: string | null; sort: number; id: string }
interface Itm { id: string; name: string | null; brand: string | null; barcode: string | null; unit: string; cover_image_id: string | null; ai: Record<string, unknown> | null }

async function b64image(path: string): Promise<{ data: string; media: string } | null> {
  // a 640px rendition keeps the call cheap; the full file is the fallback
  const urls = [
    `${SUPABASE_URL}/storage/v1/render/image/public/images/${path}?width=640&height=640&resize=contain&quality=80`,
    `${SUPABASE_URL}/storage/v1/object/public/images/${path}`,
  ]
  for (const u of urls) {
    try {
      const r = await fetch(u)
      if (!r.ok) continue
      const media = (r.headers.get('content-type') || '').split(';')[0] || (path.endsWith('.png') ? 'image/png' : 'image/webp')
      if (!/^image\/(webp|png|jpeg|gif)$/.test(media)) continue
      const bytes = new Uint8Array(await r.arrayBuffer())
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return { data: btoa(bin), media }
    } catch { /* try the next one */ }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } })
  const { data: userRes } = await userClient.auth.getUser()
  if (!userRes?.user) return json({ error: 'unauthorized' }, 401)

  let body: { item_id?: string }
  try { body = await req.json() } catch { return json({ error: 'bad_json' }, 400) }
  if (!body.item_id) return json({ error: 'item_id required' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: item } = await admin.from('items').select('id,workspace_id,name,brand,barcode,unit,cover_image_id,ai,archived_at').eq('id', body.item_id).maybeSingle()
  if (!item) return json({ error: 'not_found' }, 404)
  const { data: mem } = await admin.from('members').select('user_id').eq('workspace_id', item.workspace_id).eq('user_id', userRes.user.id).maybeSingle()
  if (!mem) return json({ error: 'forbidden' }, 403)

  const mark = async (n: number, judged: number, note?: string) => {
    await admin.from('items').update({ ai: { ...(item.ai ?? {}), match: { checked_at: new Date().toISOString(), candidates: n, judged, ...(note ? { note } : {}) } } }).eq('id', item.id)
  }

  // layer 1
  const { data: pairsRaw, error: e1 } = await admin.rpc('refresh_matches', { p_item: item.id })
  if (e1) { await mark(0, 0, 'layer1_' + e1.message); return json({ ok: false, error: 'layer1', detail: e1.message }) }
  const pairs = (pairsRaw ?? []) as Pair[]
  const other = (p: Pair) => p.item_a === item.id ? p.item_b : p.item_a

  // same barcode is certainty, no photo needed
  for (const p of pairs) {
    if (p.signals?.barcode === 'same' && !p.verdict && !p.decision) {
      await admin.from('item_matches').update({ verdict: 'same', confidence: 1, reason_he: 'אותו ברקוד בדיוק.', reason_en: 'The very same barcode.' }).eq('item_a', p.item_a).eq('item_b', p.item_b)
      p.verdict = 'same'
    }
  }
  const todo = pairs.filter(p => !p.verdict && !p.decision && p.score > 0).slice(0, MAX_JUDGE)
  if (!todo.length) { await mark(pairs.length, 0); return json({ ok: true, candidates: pairs.length, judged: 0 }) }

  const { data: secret } = await admin.from('secrets').select('value').eq('workspace_id', item.workspace_id).eq('key', 'anthropic').maybeSingle()
  const apiKey = secret?.value?.trim()
  if (!apiKey) { await mark(pairs.length, 0, 'no_key'); return json({ ok: true, candidates: pairs.length, judged: 0, note: 'no_key' }) }

  // photos: the cover of each item, the original (OKI sees what the user saw)
  const ids = [item.id, ...todo.map(other)]
  const { data: its } = await admin.from('items').select('id,name,brand,barcode,unit,cover_image_id,ai').in('id', ids)
  const { data: imgs } = await admin.from('item_images').select('id,item_id,path_original,path_clean,sort').in('item_id', ids)
  const byId = new Map(((its ?? []) as Itm[]).map(x => [x.id, x]))
  const coverOf = (id: string): Img | undefined => {
    const list = ((imgs ?? []) as Img[]).filter(i => i.item_id === id).sort((a, b) => a.sort - b.sort)
    const cov = byId.get(id)?.cover_image_id
    return list.find(i => i.id === cov) ?? list[0]
  }

  const content: unknown[] = []
  const described: string[] = []
  let n = 0
  const judged: Pair[] = []
  for (const [k, id] of ids.entries()) {
    const im = coverOf(id)
    const pic = im ? await b64image(im.path_original) : null
    if (!pic) { if (k === 0) { await mark(pairs.length, 0, 'no_image'); return json({ ok: true, judged: 0, note: 'no_image' }) } else continue }
    n += 1
    const it = byId.get(id)
    const nm = it?.name || (it?.ai?.name_he as string | undefined) || ''
    described.push(`Photo ${n}${k === 0 ? ' (THE NEW ITEM)' : ''}: name "${nm}"${it?.brand ? `, brand ${it.brand}` : ''}${it?.barcode ? `, code ${it.barcode}` : ''}, unit ${it?.unit ?? 'unit'}`)
    content.push({ type: 'text', text: `Photo ${n}` })
    content.push({ type: 'image', source: { type: 'base64', media_type: pic.media, data: pic.data } })
    if (k > 0) judged.push(todo[k - 1])
  }
  if (!judged.length) { await mark(pairs.length, 0, 'no_image'); return json({ ok: true, judged: 0 }) }

  const prompt = `You are OKI, the cataloguing assistant of TREZURE, a home equipment inventory.
Photo 1 is an item just photographed. Photos 2 to ${n} are items already in the inventory.
${described.join('\n')}

For each of photos 2 to ${n}, decide how it relates to photo 1:
- "same": the very same product. Same model, size, colour and design; a second unit of the same thing that belongs on one inventory line.
- "family": the same kind of thing, but a different model, size, colour, design or print. Worth storing together, not the same line.
- "unrelated": a different kind of thing.
Be strict about "same": different printed designs, sizes or colours are "family". Codes that differ mean different products.

Return ONLY JSON, no prose, no markdown:
{"results":[{"photo":2,"verdict":"same|family|unrelated","confidence":0.0,"reason_he":"...","reason_en":"..."}]}
reason_he: one short dry sentence in Hebrew naming the visible difference or match, no exclamation marks (for example "אותו אלבום, אותו כיתוב על הכריכה" or "אלבום אחר, עיצוב כריכה שונה"). reason_en: the same in English.`
  content.push({ type: 'text', text: prompt })

  let text = ''
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, temperature: 0, messages: [{ role: 'user', content }] }),
    })
    const data = await r.json()
    if (!r.ok) { await mark(pairs.length, 0, 'anthropic_' + (data?.error?.type ?? r.status)); return json({ ok: false, error: 'anthropic', detail: data?.error?.message }) }
    text = (data.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('')
  } catch (e) { await mark(pairs.length, 0, 'network'); return json({ ok: false, error: 'network', detail: String(e) }) }

  let results: { photo: number; verdict: string; confidence: number; reason_he?: string; reason_en?: string }[] = []
  try { const m = text.match(/\{[\s\S]*\}/); results = JSON.parse(m ? m[0] : text).results ?? [] } catch { await mark(pairs.length, 0, 'bad_json'); return json({ ok: false, error: 'bad_json' }) }

  let done = 0
  for (const res of results) {
    const p = judged[res.photo - 2]
    if (!p || !['same', 'family', 'unrelated'].includes(res.verdict)) continue
    // two different codes are two different products, whatever the photos look like
    const verdict = res.verdict === 'same' && p.signals?.barcode === 'diff' ? 'family' : res.verdict
    await admin.from('item_matches').update({
      verdict, confidence: Math.max(0, Math.min(1, Number(res.confidence) || 0)),
      reason_he: (res.reason_he ?? '').slice(0, 200) || null, reason_en: (res.reason_en ?? '').slice(0, 200) || null, updated_at: new Date().toISOString(),
    }).eq('item_a', p.item_a).eq('item_b', p.item_b)
    done += 1
  }
  await mark(pairs.length, done)
  return json({ ok: true, candidates: pairs.length, judged: done })
})
