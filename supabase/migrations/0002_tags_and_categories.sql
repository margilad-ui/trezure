-- TREZURE · applied to organizur (tkacgqckejabgnlzdujx) on 2026-10-16 via MCP execute_sql.
-- Additive. Adds additional categories per item, and hardens function grants.
-- Tags needed no migration: items.tags already existed and is already in the search tsvector.

-- an item has one primary category (items.category_id) and any number of additional ones
create table if not exists public.item_categories (
  item_id uuid not null references public.items(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (item_id, category_id));

create policy itemcat_select on public.item_categories for select to authenticated using (public.is_member(workspace_id));
create policy itemcat_insert on public.item_categories for insert to authenticated with check (public.can_do(workspace_id,'can_edit'));
create policy itemcat_delete on public.item_categories for delete to authenticated using (public.can_do(workspace_id,'can_edit'));
create index if not exists item_categories_cat on public.item_categories (workspace_id, category_id);
create index if not exists item_categories_item on public.item_categories (item_id);

-- denormalised union of the primary and the additional categories, so one indexed
-- query answers "every item in this category", whichever way it belongs
alter table public.items add column if not exists category_ids uuid[] not null default '{}';
create index if not exists items_category_ids on public.items using gin (category_ids);

create or replace function public.sync_item_category_ids(p_item uuid) returns void language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  select coalesce(array_agg(distinct x), '{}')::uuid[] into ids
  from (
    select category_id as x from public.items where id = p_item and category_id is not null
    union
    select category_id from public.item_categories where item_id = p_item
  ) s;
  update public.items set category_ids = coalesce(ids, '{}') where id = p_item;
end $$;

create or replace function public.trg_item_categories_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_item_category_ids(coalesce(new.item_id, old.item_id));
  return null;
end $$;
create trigger trg_item_categories_aiud after insert or delete on public.item_categories
  for each row execute function public.trg_item_categories_sync();

create or replace function public.trg_items_category_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    perform public.sync_item_category_ids(new.id);
  end if;
  return null;
end $$;
-- fires only on category_id, so writing category_ids back does not re-enter
create trigger trg_items_cat_sync after insert or update of category_id on public.items
  for each row execute function public.trg_items_category_sync();

update public.items set category_ids = (case when category_id is null then '{}'::uuid[] else array[category_id] end)
  where category_ids = '{}' and category_id is not null;

-- Grants. Functions inherit EXECUTE from PUBLIC, so revoking from anon and
-- authenticated alone does nothing; PUBLIC has to be revoked as well.
revoke execute on function public.sync_item_category_ids(uuid) from public, anon, authenticated;
revoke execute on function public.trg_item_categories_sync() from public, anon, authenticated;
revoke execute on function public.trg_items_category_sync() from public, anon, authenticated;
revoke execute on function public.workspace_add_owner() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- RLS policies evaluate these as the caller, so authenticated must keep EXECUTE
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.can_do(uuid, text) from public, anon;
revoke execute on function public.is_owner(uuid) from public, anon;
revoke execute on function public.has_secret(uuid, text) from public, anon;
revoke execute on function public.set_secret(uuid, text, text) from public, anon;
revoke execute on function public.adjust_qty(uuid, numeric) from public, anon;
revoke execute on function public.create_workspace(text, text, text) from public, anon;
grant execute on function public.is_member(uuid), public.can_do(uuid, text), public.is_owner(uuid),
  public.has_secret(uuid, text), public.set_secret(uuid, text, text), public.adjust_qty(uuid, numeric),
  public.create_workspace(text, text, text) to authenticated, service_role;

-- Auth settings changed in the dashboard the same day (no SQL equivalent):
--   email OTP length 8 -> 6, minimum password length 6 -> 8,
--   leaked password protection on, custom SMTP via Resend (email limit 2/h -> 30/h).
