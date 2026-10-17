-- TREZURE · 0005 · twins (sprint 3, pillars 2 and 3)
-- Layer 1 in the database: name trigrams (pg_trgm), brand, primary category, tag overlap, barcode.
-- Layer 2 (OKI looking at the photos) lives in the `match` Edge Function and writes verdicts here.
-- Additive only. Applied 17.10.2026 via execute_sql.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.item_matches (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_a uuid not null references public.items(id) on delete cascade,
  item_b uuid not null references public.items(id) on delete cascade,
  score numeric not null default 0,
  signals jsonb not null default '{}'::jsonb,
  verdict text check (verdict in ('same', 'family', 'unrelated')),
  confidence numeric,
  reason_he text,
  reason_en text,
  decision text check (decision in ('merged', 'near', 'dismissed')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_a, item_b),
  check (item_a < item_b)
);
create index if not exists item_matches_ws on public.item_matches(workspace_id, score desc);
create index if not exists item_matches_b on public.item_matches(item_b);

-- (separate call)
create policy itemmatch_select on public.item_matches for select using (public.is_member(workspace_id));
create policy itemmatch_update on public.item_matches for update using (public.can_do(workspace_id, 'can_edit'));
create policy itemmatch_insert on public.item_matches for insert with check (public.can_do(workspace_id, 'can_edit'));

-- Score: 0.5 x name trigram similarity, +0.13 same brand / -0.2 different brand, +0.12 same category,
-- +0.25 x tag Jaccard. Same barcode = 1. Different barcodes are recorded and cap OKI's verdict at "family".
-- Kept from 0.42 up (calibrated 17.10 on the six photo albums: family pairs land between 0.42 and 0.54).
create or replace function public.match_candidates(p_item uuid, p_min numeric default 0.42)
returns table (other uuid, score numeric, signals jsonb)
language sql stable security definer set search_path = public, extensions as $$
  with prof as (
    select i.id, i.workspace_id, i.unit,
      lower(btrim(coalesce(nullif(btrim(i.name), ''), i.ai->>'name_he', ''))) as nm,
      lower(nullif(btrim(coalesce(nullif(btrim(i.brand), ''), i.ai->>'brand', '')), '')) as br,
      coalesce(i.category_id, case when coalesce((i.ai->>'confidence')::numeric, 0) >= 0.5 and (i.ai->>'category_id') ~ '^[0-9a-f-]{36}$' then (i.ai->>'category_id')::uuid end) as cat,
      case when coalesce(cardinality(i.tags), 0) > 0 then i.tags
           when jsonb_typeof(i.ai->'tags') = 'array' then array(select jsonb_array_elements_text(i.ai->'tags'))
           else '{}'::text[] end as tg,
      nullif(ltrim(regexp_replace(coalesce(i.barcode, ''), '\D', '', 'g'), '0'), '') as bc
    from public.items i
    where i.workspace_id = (select workspace_id from public.items where id = p_item)
      and (i.id = p_item or i.archived_at is null)
  ), me as (select * from prof where id = p_item),
  pairs as (
    select o.id as other,
      case when me.nm = '' or o.nm = '' then 0 else similarity(me.nm, o.nm) end::numeric as ns,
      case when me.br is null or o.br is null then 0 when me.br = o.br then 1 else -1 end as bs,
      (me.cat is not null and me.cat = o.cat) as cs,
      coalesce((select count(*) from (select unnest(me.tg) intersect select unnest(o.tg)) x)::numeric
        / nullif((select count(*) from (select unnest(me.tg) union select unnest(o.tg)) y), 0), 0) as js,
      case when me.bc is null or o.bc is null then null when me.bc = o.bc then 'same' else 'diff' end as bcs,
      (me.unit is not distinct from o.unit) as us
    from prof o, me where o.id <> me.id
  ), scored as (
    select other,
      case when bcs = 'same' then 1
        else greatest(0, least(1, 0.5 * ns + case bs when 1 then 0.13 when -1 then -0.2 else 0 end + case when cs then 0.12 else 0 end + 0.25 * js)) end as score,
      jsonb_build_object('name', round(ns, 2), 'brand', bs, 'category', cs, 'tags', round(js, 2), 'barcode', bcs, 'unit_same', us) as signals
    from pairs
  )
  select other, round(score, 3), signals from scored where score >= p_min order by score desc limit 5
$$;

create or replace function public.refresh_matches(p_item uuid) returns setof public.item_matches
language plpgsql security definer set search_path = public, extensions as $$
declare ws uuid;
begin
  select workspace_id into ws from public.items where id = p_item;
  if ws is null then return; end if;
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_member(ws) then raise exception 'forbidden'; end if;
  update public.item_matches set score = 0, updated_at = now()
    where (item_a = p_item or item_b = p_item) and decision is null and score > 0;
  insert into public.item_matches (workspace_id, item_a, item_b, score, signals)
  select ws, least(p_item, c.other), greatest(p_item, c.other), c.score, c.signals from public.match_candidates(p_item) c
  on conflict (item_a, item_b) do update set
    signals = excluded.signals,
    verdict = case when public.item_matches.decision is null and public.item_matches.verdict is not null
                    and (public.item_matches.signals->>'name') is distinct from (excluded.signals->>'name') then null else public.item_matches.verdict end,
    score = excluded.score, updated_at = now();
  return query select * from public.item_matches where (item_a = p_item or item_b = p_item) and score > 0 order by score desc;
end $$;

-- merge_items(src, dst): src's quantities per place, photos, new tags and (if dst has none) barcode move to dst;
-- src is archived with merged_into = dst. The activity row 'merge' on dst holds everything undo needs.
-- unmerge_items(src): the exact reverse; returns the places that were new to dst so the app forgets them at zero.
-- scan_matches(ws): rescoring every live item, returns the number of open pairs.

create or replace function public.merge_items(p_src uuid, p_dst uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.items; d public.items; moved jsonb; fresh jsonb; imgs jsonb; tags_added text[]; bc_added boolean := false;
begin
  select * into s from public.items where id = p_src;
  select * into d from public.items where id = p_dst;
  if s.id is null or d.id is null or s.workspace_id <> d.workspace_id or p_src = p_dst then raise exception 'not_found'; end if;
  if not public.can_do(s.workspace_id, 'can_edit') then raise exception 'forbidden'; end if;
  if s.archived_at is not null or d.archived_at is not null then raise exception 'archived'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('loc', location_id, 'qty', qty)), '[]'::jsonb) into moved
    from public.item_locations where item_id = p_src and qty > 0;
  select coalesce(jsonb_agg(l.location_id), '[]'::jsonb) into fresh
    from public.item_locations l where l.item_id = p_src and l.qty > 0
      and not exists (select 1 from public.item_locations x where x.item_id = p_dst and x.location_id = l.location_id);
  insert into public.item_locations (item_id, location_id, workspace_id, qty)
    select p_dst, location_id, workspace_id, qty from public.item_locations where item_id = p_src and qty > 0
  on conflict (item_id, location_id) do update set qty = public.item_locations.qty + excluded.qty, updated_at = now();
  if moved = '[]'::jsonb and coalesce(s.qty, 0) > 0 and d.location_id is not null then
    perform public.adjust_qty_at(p_dst, d.location_id, s.qty);
    moved := jsonb_build_array(jsonb_build_object('loc', d.location_id, 'qty', s.qty));
  end if;
  select coalesce(jsonb_agg(id), '[]'::jsonb) into imgs from public.item_images where item_id = p_src;
  update public.item_images set item_id = p_dst, sort = sort + 100 where item_id = p_src;
  tags_added := array(select unnest(coalesce(s.tags, '{}')) except select unnest(coalesce(d.tags, '{}')));
  if cardinality(tags_added) > 0 then update public.items set tags = coalesce(tags, '{}') || tags_added where id = p_dst; end if;
  if d.barcode is null and s.barcode is not null then update public.items set barcode = s.barcode where id = p_dst; bc_added := true; end if;
  update public.items set archived_at = now(), merged_into = p_dst where id = p_src;
  insert into public.item_matches (workspace_id, item_a, item_b, decision, decided_at, verdict)
    values (s.workspace_id, least(p_src, p_dst), greatest(p_src, p_dst), 'merged', now(), 'same')
  on conflict (item_a, item_b) do update set decision = 'merged', decided_at = now();
  insert into public.activity (workspace_id, item_id, user_id, action, diff)
  values (s.workspace_id, p_dst, auth.uid(), 'merge', jsonb_build_object('from', p_src, 'name', s.name, 'rows', moved, 'fresh', fresh, 'images', imgs, 'tags_added', to_jsonb(tags_added), 'barcode_added', bc_added));
  return jsonb_build_object('into', p_dst, 'rows', moved, 'images', jsonb_array_length(imgs));
end $$;

create or replace function public.unmerge_items(p_src uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.items; a jsonb; r jsonb;
begin
  select * into s from public.items where id = p_src;
  if s.id is null or s.merged_into is null then raise exception 'not_merged'; end if;
  if not public.can_do(s.workspace_id, 'can_edit') then raise exception 'forbidden'; end if;
  select diff into a from public.activity where item_id = s.merged_into and action = 'merge' and diff->>'from' = p_src::text order by created_at desc limit 1;
  if a is null then raise exception 'no_record'; end if;
  for r in select * from jsonb_array_elements(a->'rows') loop
    update public.item_locations set qty = greatest(0, qty - (r->>'qty')::numeric), updated_at = now()
      where item_id = s.merged_into and location_id = (r->>'loc')::uuid;
  end loop;
  update public.item_images set item_id = p_src, sort = greatest(0, sort - 100)
    where id in (select (jsonb_array_elements_text(a->'images'))::uuid);
  if jsonb_array_length(coalesce(a->'tags_added', '[]'::jsonb)) > 0 then
    update public.items set tags = array(select unnest(tags) except select jsonb_array_elements_text(a->'tags_added')) where id = s.merged_into;
  end if;
  if (a->>'barcode_added')::boolean then update public.items set barcode = null where id = s.merged_into; end if;
  update public.items set archived_at = null, merged_into = null where id = p_src;
  update public.item_matches set decision = null, decided_at = null
    where item_a = least(p_src, s.merged_into) and item_b = greatest(p_src, s.merged_into);
  insert into public.activity (workspace_id, item_id, user_id, action, diff)
  values (s.workspace_id, s.merged_into, auth.uid(), 'unmerge', jsonb_build_object('from', p_src));
  return jsonb_build_object('into', s.merged_into, 'fresh', coalesce(a->'fresh', '[]'::jsonb));
end $$;

create or replace function public.scan_matches(p_ws uuid) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_member(p_ws) then raise exception 'forbidden'; end if;
  for r in select id from public.items where workspace_id = p_ws and archived_at is null loop
    perform public.refresh_matches(r.id);
  end loop;
  select count(*) into n from public.item_matches m
    join public.items a on a.id = m.item_a and a.archived_at is null
    join public.items b on b.id = m.item_b and b.archived_at is null
    where m.workspace_id = p_ws and m.decision is null and m.score > 0 and coalesce(m.verdict, '') <> 'unrelated';
  return n;
end $$;
