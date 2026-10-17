-- TREZURE · 0004 · quantity per location (sprint 3, pillar 1)
-- One item, many places. item_locations is the truth; items.qty is the sum and items.location_id the place
-- holding the most, both maintained here so every older screen keeps working unchanged.
-- Additive only. Applied 17.10.2026 via execute_sql in four calls (table, policies, functions, backfill).

-- 1. table ------------------------------------------------------------------------------------------
create table if not exists public.item_locations (
  item_id uuid not null references public.items(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  qty numeric not null default 0 check (qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, location_id)
);
create index if not exists item_locations_loc on public.item_locations(location_id);
create index if not exists item_locations_ws on public.item_locations(workspace_id);
alter table public.items add column if not exists merged_into uuid references public.items(id) on delete set null;

-- 2. policies (separate call: RLS is switched on automatically when the table is born) ---------------
create policy itemloc_select on public.item_locations for select using (public.is_member(workspace_id));
create policy itemloc_insert on public.item_locations for insert with check (public.can_do(workspace_id, 'can_edit'));
create policy itemloc_update on public.item_locations for update using (public.can_do(workspace_id, 'can_edit'));
create policy itemloc_delete on public.item_locations for delete using (public.can_do(workspace_id, 'can_edit'));

-- 3. sync ----------------------------------------------------------------------------------------------
-- items.qty / location_id / stock_state from the rows. The flag tz.sync stops the items trigger from
-- reading this write as a user edit.
create or replace function public.recompute_item_stock(p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare total numeric; prim uuid; cur uuid; minq numeric; n int; st text;
begin
  select location_id, min_qty into cur, minq from public.items where id = p_item;
  if not found then return; end if;
  select count(*), coalesce(sum(qty), 0) into n, total from public.item_locations where item_id = p_item;
  if n = 0 then return; end if;
  select location_id into prim from public.item_locations where item_id = p_item
    order by qty desc, (location_id = cur) desc, created_at asc limit 1;
  st := case when total = 0 then 'empty' when minq is not null and total <= minq then 'low' else 'full' end;
  perform set_config('tz.sync', '1', true);
  update public.items set qty = total, location_id = prim, stock_state = st
    where id = p_item and (qty is distinct from total or location_id is distinct from prim or stock_state is distinct from st);
  perform set_config('tz.sync', '', true);
end $$;

create or replace function public.trg_item_locations_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_item_stock(coalesce(new.item_id, old.item_id));
  if tg_op = 'UPDATE' and new.item_id is distinct from old.item_id then perform public.recompute_item_stock(old.item_id); end if;
  return null;
end $$;

create trigger trg_item_locations_aiud after insert or update or delete on public.item_locations
  for each row execute function public.trg_item_locations_after();

-- Writes that still go straight to items (capture queue, sort screen, older clients) are translated into rows:
-- a new item lands with its quantity in its place; a changed place moves that place's row; a changed
-- quantity is applied to the item's main place.
create or replace function public.trg_items_stock_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare d numeric; moved numeric; has_rows boolean;
begin
  if coalesce(current_setting('tz.sync', true), '') = '1' then return null; end if;
  if tg_op = 'INSERT' then
    if new.location_id is not null then
      insert into public.item_locations (item_id, location_id, workspace_id, qty)
      values (new.id, new.location_id, new.workspace_id, greatest(coalesce(new.qty, 0), 0))
      on conflict (item_id, location_id) do nothing;
    end if;
    return null;
  end if;

  select exists (select 1 from public.item_locations where item_id = new.id) into has_rows;
  if new.location_id is distinct from old.location_id and new.location_id is not null then
    if not has_rows then
      insert into public.item_locations (item_id, location_id, workspace_id, qty)
      values (new.id, new.location_id, new.workspace_id, greatest(coalesce(old.qty, 0), 0))
      on conflict (item_id, location_id) do nothing;
    elsif old.location_id is not null then
      delete from public.item_locations where item_id = new.id and location_id = old.location_id returning qty into moved;
      insert into public.item_locations (item_id, location_id, workspace_id, qty)
      values (new.id, new.location_id, new.workspace_id, coalesce(moved, 0))
      on conflict (item_id, location_id) do update set qty = public.item_locations.qty + excluded.qty, updated_at = now();
    end if;
  end if;
  if new.qty is distinct from old.qty and new.location_id is not null then
    d := coalesce(new.qty, 0) - coalesce(old.qty, 0);
    if not exists (select 1 from public.item_locations where item_id = new.id) then
      insert into public.item_locations (item_id, location_id, workspace_id, qty)
      values (new.id, new.location_id, new.workspace_id, greatest(coalesce(new.qty, 0), 0));
    else
      insert into public.item_locations (item_id, location_id, workspace_id, qty)
      values (new.id, new.location_id, new.workspace_id, greatest(d, 0))
      on conflict (item_id, location_id) do update set qty = greatest(0, public.item_locations.qty + d), updated_at = now();
    end if;
  end if;
  perform public.recompute_item_stock(new.id);
  return null;
end $$;

create trigger trg_items_stock_sync after insert or update of location_id, qty on public.items
  for each row execute function public.trg_items_stock_sync();

-- +/- in one place (or the main place when none is given). Creates the row when the place is new.
create or replace function public.adjust_qty_at(p_item uuid, p_loc uuid, p_delta numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ws uuid; loc uuid; here numeric; total numeric; minq numeric;
begin
  select workspace_id, location_id, min_qty into ws, loc, minq from public.items where id = p_item;
  if ws is null or not public.can_do(ws, 'can_edit') then raise exception 'forbidden'; end if;
  loc := coalesce(p_loc, loc);
  if loc is not null and not exists (select 1 from public.locations where id = loc and workspace_id = ws) then raise exception 'bad_location'; end if;
  if loc is null then
    perform set_config('tz.sync', '1', true);
    update public.items set qty = greatest(0, qty + p_delta),
      stock_state = case when greatest(0, qty + p_delta) = 0 then 'empty' when minq is not null and greatest(0, qty + p_delta) <= minq then 'low' else 'full' end
      where id = p_item returning qty into total;
    perform set_config('tz.sync', '', true);
    here := total;
  else
    insert into public.item_locations (item_id, location_id, workspace_id, qty) values (p_item, loc, ws, greatest(p_delta, 0))
    on conflict (item_id, location_id) do update set qty = greatest(0, public.item_locations.qty + p_delta), updated_at = now()
    returning qty into here;
    select qty into total from public.items where id = p_item;
  end if;
  insert into public.activity (workspace_id, item_id, user_id, action, diff)
  values (ws, p_item, auth.uid(), 'qty', jsonb_build_object('delta', p_delta, 'qty', total, 'loc', loc, 'here', here));
  return jsonb_build_object('total', total, 'here', here, 'location_id', loc);
end $$;

-- the original two argument call keeps working and now acts on the main place
create or replace function public.adjust_qty(item uuid, delta numeric) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  return (public.adjust_qty_at(item, null, delta) ->> 'total')::numeric;
end $$;

-- Move some (or, with p_qty null, all) of one place's quantity to another place.
create or replace function public.move_qty(p_item uuid, p_from uuid, p_to uuid, p_qty numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ws uuid; have numeric; amt numeric;
begin
  select workspace_id into ws from public.items where id = p_item;
  if ws is null or not public.can_do(ws, 'can_edit') then raise exception 'forbidden'; end if;
  if p_from = p_to then return jsonb_build_object('moved', 0); end if;
  if not exists (select 1 from public.locations where id = p_to and workspace_id = ws) then raise exception 'bad_location'; end if;
  select qty into have from public.item_locations where item_id = p_item and location_id = p_from;
  if have is null then raise exception 'not_here'; end if;
  amt := case when p_qty is null then have else least(greatest(p_qty, 0), have) end;
  insert into public.item_locations (item_id, location_id, workspace_id, qty) values (p_item, p_to, ws, amt)
  on conflict (item_id, location_id) do update set qty = public.item_locations.qty + amt, updated_at = now();
  if p_qty is null or amt >= have then
    delete from public.item_locations where item_id = p_item and location_id = p_from;
  else
    update public.item_locations set qty = qty - amt, updated_at = now() where item_id = p_item and location_id = p_from;
  end if;
  insert into public.activity (workspace_id, item_id, user_id, action, diff)
  values (ws, p_item, auth.uid(), 'move', jsonb_build_object('from', p_from, 'to', p_to, 'qty', amt));
  return jsonb_build_object('moved', amt);
end $$;

-- An empty place is forgotten from the app (delete on item_locations, allowed by itemloc_delete), only when the
-- item still lives somewhere else. A server side function for it was not created (17.10).

-- every function checks can_do itself, so anon gets nothing from calling them

-- 4. backfill: every existing item gets one row with its place and quantity --------------------------
insert into public.item_locations (item_id, location_id, workspace_id, qty)
select id, location_id, workspace_id, greatest(coalesce(qty, 0), 0) from public.items where location_id is not null
on conflict (item_id, location_id) do nothing;
