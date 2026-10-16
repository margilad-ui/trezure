-- Sprint 2: background tint per category for the clean item display. Additive only.
alter table public.categories add column if not exists color text;
