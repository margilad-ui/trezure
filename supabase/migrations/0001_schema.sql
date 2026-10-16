-- TREZURE · schema as applied to organizur (tkacgqckejabgnlzdujx) on 2026-10-16 via MCP execute_sql.
-- Additive only. RLS is enabled automatically on new public tables by the project's rls_auto_enable trigger.
-- Note: array_to_string is STABLE, so the generated tsvector uses an IMMUTABLE wrapper.

create or replace function public.imm_array_to_string(arr text[], sep text) returns text
  language sql immutable parallel safe set search_path = public as $$ select array_to_string(arr, sep) $$;

-- tables -----------------------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(), name text not null, slug text unique,
  kind text not null default 'home' check (kind in ('home','business','org')),
  locale text not null default 'he', created_by uuid references auth.users(id), created_at timestamptz default now());

create table if not exists public.members (
  workspace_id uuid references public.workspaces(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','editor','viewer')),
  perms jsonb not null default '{"can_add":true,"can_edit":true,"can_delete":false,"can_export":true,"can_print":true,"categories":null}',
  invited_email text, joined_at timestamptz default now(), primary key (workspace_id, user_id));

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.locations(id), kind text not null check (kind in ('site','room','cabinet','shelf','box','drawer','other')),
  name text not null, code text not null, color text, sort int default 0, photo_path text, path text, created_at timestamptz default now(),
  unique (workspace_id, code));

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.categories(id), name_he text not null, name_en text, icon text,
  default_unit text default 'unit', default_kind text default 'equipment' check (default_kind in ('equipment','consumable')),
  fields jsonb not null default '[]', sort int default 0);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text, brand text, category_id uuid references public.categories(id), location_id uuid references public.locations(id),
  qty numeric not null default 1, unit text not null default 'unit',
  kind text not null default 'equipment' check (kind in ('equipment','consumable','kit')),
  stock_state text not null default 'full' check (stock_state in ('full','low','empty')), min_qty numeric,
  condition text check (condition in ('new','good','worn','broken')), barcode text, tags text[] default '{}',
  attrs jsonb not null default '{}', notes text, price numeric, currency text default 'ILS',
  cover_image_id uuid, stage text not null default 'inbox' check (stage in ('inbox','ready')), ai jsonb,
  search tsvector generated always as (to_tsvector('simple'::regconfig, coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(barcode,'') || ' ' || public.imm_array_to_string(tags,' '))) stored,
  created_by uuid references auth.users(id), created_at timestamptz default now(), updated_at timestamptz default now(), archived_at timestamptz);

create table if not exists public.item_images (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade, path_original text not null, path_clean text, path_thumb text,
  source text not null default 'camera' check (source in ('camera','lens','generated','upload')),
  angle text default 'front' check (angle in ('front','side','back','detail')), sort int default 0, width int, height int, created_at timestamptz default now());

create table if not exists public.image_jobs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade, image_id uuid references public.item_images(id) on delete cascade,
  type text not null check (type in ('analyze','lens','clean','generate','barcode')),
  status text not null default 'pending' check (status in ('pending','running','done','error','needs_reshoot')),
  request jsonb, result jsonb, error text, created_at timestamptz default now(), updated_at timestamptz default now());

create table if not exists public.activity (id bigserial primary key, workspace_id uuid not null, item_id uuid, user_id uuid, action text not null, diff jsonb, created_at timestamptz default now());
create table if not exists public.label_templates (id uuid primary key default gen_random_uuid(), workspace_id uuid, name text, width_mm numeric, height_mm numeric, dpi int default 203, layout jsonb, is_default boolean default false);
create table if not exists public.settings (workspace_id uuid references public.workspaces(id) on delete cascade, key text, value jsonb, primary key (workspace_id, key));
create table if not exists public.secrets (workspace_id uuid references public.workspaces(id) on delete cascade, key text, value text, primary key (workspace_id, key));
create table if not exists public.barcode_cache (barcode text primary key, data jsonb, source text, fetched_at timestamptz default now());
create table if not exists public.kit_items (kit_id uuid references public.items(id) on delete cascade, item_id uuid references public.items(id) on delete cascade, qty numeric default 1, primary key (kit_id, item_id));
create table if not exists public.loans (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, item_id uuid references public.items(id), qty numeric default 1, to_name text, purpose text, out_at timestamptz default now(), due_at timestamptz, returned_at timestamptz, notes text, created_by uuid);

-- functions --------------------------------------------------------------------------------------
create or replace function public.is_member(ws uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.members where workspace_id = ws and user_id = auth.uid()) $$;
create or replace function public.can_do(ws uuid, perm text) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select (perms->>perm)::boolean from public.members where workspace_id = ws and user_id = auth.uid()), false) $$;
create or replace function public.is_owner(ws uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.members where workspace_id = ws and user_id = auth.uid() and role in ('owner','admin')) $$;

create or replace function public.workspace_add_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (workspace_id, user_id, role, perms)
  values (new.id, coalesce(new.created_by, auth.uid()), 'owner', '{"can_add":true,"can_edit":true,"can_delete":true,"can_export":true,"can_print":true,"categories":null}')
  on conflict do nothing;
  return new;
end $$;
create trigger trg_workspace_add_owner after insert on public.workspaces for each row execute function public.workspace_add_owner();

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger trg_items_touch before update on public.items for each row execute function public.touch_updated_at();
create trigger trg_jobs_touch before update on public.image_jobs for each row execute function public.touch_updated_at();

-- secrets are written through RPC only; no client policies exist on the table.
create or replace function public.set_secret(ws uuid, k text, v text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(ws) then raise exception 'not_owner'; end if;
  insert into public.secrets (workspace_id, key, value) values (ws, k, v)
  on conflict (workspace_id, key) do update set value = excluded.value;
end $$;
create or replace function public.has_secret(ws uuid, k text) returns boolean language sql stable security definer set search_path = public as
$$ select public.is_member(ws) and exists (select 1 from public.secrets where workspace_id = ws and key = k and coalesce(value,'') <> '') $$;

create or replace function public.adjust_qty(item uuid, delta numeric) returns numeric language plpgsql security definer set search_path = public as $$
declare ws uuid; newq numeric;
begin
  select workspace_id into ws from public.items where id = item;
  if ws is null or not public.can_do(ws,'can_edit') then raise exception 'forbidden'; end if;
  update public.items set qty = greatest(0, qty + delta),
    stock_state = case when greatest(0, qty + delta) = 0 then 'empty' when min_qty is not null and greatest(0, qty + delta) <= min_qty then 'low' else 'full' end
    where id = item returning qty into newq;
  insert into public.activity (workspace_id, item_id, user_id, action, diff) values (ws, item, auth.uid(), 'qty', jsonb_build_object('delta', delta, 'qty', newq));
  return newq;
end $$;

create or replace function public.create_workspace(p_name text, p_kind text default 'home', p_locale text default 'he') returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.workspaces (name, kind, locale, created_by) values (p_name, p_kind, p_locale, auth.uid()) returning id into ws;
  return ws;
end $$;

-- policies (separate call from the tables) --------------------------------------------------------
create policy ws_select on public.workspaces for select to authenticated using (public.is_member(id));
create policy ws_insert on public.workspaces for insert to authenticated with check (created_by = auth.uid());
create policy ws_update on public.workspaces for update to authenticated using (public.is_owner(id));
create policy mem_select on public.members for select to authenticated using (public.is_member(workspace_id));
create policy mem_insert on public.members for insert to authenticated with check (public.is_owner(workspace_id));
create policy mem_update on public.members for update to authenticated using (public.is_owner(workspace_id));
create policy loc_select on public.locations for select to authenticated using (public.is_member(workspace_id));
create policy loc_insert on public.locations for insert to authenticated with check (public.can_do(workspace_id,'can_add'));
create policy loc_update on public.locations for update to authenticated using (public.can_do(workspace_id,'can_edit'));
create policy cat_select on public.categories for select to authenticated using (public.is_member(workspace_id));
create policy cat_insert on public.categories for insert to authenticated with check (public.can_do(workspace_id,'can_add'));
create policy cat_update on public.categories for update to authenticated using (public.can_do(workspace_id,'can_edit'));
create policy items_select on public.items for select to authenticated using (public.is_member(workspace_id));
create policy items_insert on public.items for insert to authenticated with check (public.can_do(workspace_id,'can_add'));
create policy items_update on public.items for update to authenticated using (public.can_do(workspace_id,'can_edit'));
create policy img_select on public.item_images for select to authenticated using (public.is_member(workspace_id));
create policy img_insert on public.item_images for insert to authenticated with check (public.can_do(workspace_id,'can_add'));
create policy img_update on public.item_images for update to authenticated using (public.can_do(workspace_id,'can_edit'));
create policy jobs_select on public.image_jobs for select to authenticated using (public.is_member(workspace_id));
create policy jobs_insert on public.image_jobs for insert to authenticated with check (public.can_do(workspace_id,'can_add'));
create policy jobs_update on public.image_jobs for update to authenticated using (public.can_do(workspace_id,'can_edit'));
create policy act_select on public.activity for select to authenticated using (public.is_member(workspace_id));
create policy act_insert on public.activity for insert to authenticated with check (public.is_member(workspace_id));
create policy lbl_select on public.label_templates for select to authenticated using (workspace_id is null or public.is_member(workspace_id));
create policy lbl_insert on public.label_templates for insert to authenticated with check (public.can_do(workspace_id,'can_edit'));
create policy lbl_update on public.label_templates for update to authenticated using (public.can_do(workspace_id,'can_edit'));
create policy set_select on public.settings for select to authenticated using (public.is_member(workspace_id));
create policy set_insert on public.settings for insert to authenticated with check (public.is_owner(workspace_id));
create policy set_update on public.settings for update to authenticated using (public.is_owner(workspace_id));
create policy bc_select on public.barcode_cache for select to authenticated using (true);
create policy bc_insert on public.barcode_cache for insert to authenticated with check (true);
create policy kit_select on public.kit_items for select to authenticated using (exists (select 1 from public.items i where i.id = kit_id and public.is_member(i.workspace_id)));
create policy kit_insert on public.kit_items for insert to authenticated with check (exists (select 1 from public.items i where i.id = kit_id and public.can_do(i.workspace_id,'can_edit')));
create policy kit_delete on public.kit_items for delete to authenticated using (exists (select 1 from public.items i where i.id = kit_id and public.can_do(i.workspace_id,'can_edit')));
create policy loan_select on public.loans for select to authenticated using (public.is_member(workspace_id));
create policy loan_insert on public.loans for insert to authenticated with check (public.can_do(workspace_id,'can_edit'));
create policy loan_update on public.loans for update to authenticated using (public.can_do(workspace_id,'can_edit'));

-- indexes ----------------------------------------------------------------------------------------
create index if not exists items_ws_stage on public.items (workspace_id, stage);
create index if not exists items_search on public.items using gin (search);
create index if not exists items_location on public.items (location_id);
create index if not exists items_category on public.items (category_id);
create index if not exists items_barcode on public.items (workspace_id, barcode);
create index if not exists locations_ws_parent on public.locations (workspace_id, parent_id);
create index if not exists image_jobs_status on public.image_jobs (status);
create index if not exists item_images_item on public.item_images (item_id);
create index if not exists activity_ws on public.activity (workspace_id, created_at desc);
create index if not exists members_user on public.members (user_id);

-- storage ----------------------------------------------------------------------------------------
-- bucket images: public read, 10MB, webp/jpeg/png. Object path: {workspace_id}/{item_id}/{image_id}.webp
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('images','images',true, 10485760, array['image/webp','image/jpeg','image/png']) on conflict (id) do nothing;
create policy images_insert_members on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy images_update_members on storage.objects for update to authenticated
  using (bucket_id = 'images' and public.is_member(((storage.foldername(name))[1])::uuid));
