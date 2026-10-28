-- Run once in the Supabase project's SQL Editor. Re-running is safe.
-- Cloud copies are immutable; each save creates a separate snapshot.
begin;

create table if not exists public.electro_cloud_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('electro', 'general')),
  title text not null check (char_length(title) <= 200),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload @> '{"version": 1}'::jsonb
    and payload ? 'kind' and payload->>'kind' = kind
    and payload ? 'record' and jsonb_typeof(payload->'record') = 'object'
    and octet_length(payload::text) <= 10485760
  ),
  created_at timestamptz not null default now()
);

create index if not exists electro_cloud_documents_owner_created
  on public.electro_cloud_documents (owner_id, created_at desc);

alter table public.electro_cloud_documents enable row level security;
alter table public.electro_cloud_documents force row level security;
revoke all on public.electro_cloud_documents from public, anon, authenticated;
grant select, insert, delete on public.electro_cloud_documents to authenticated;

drop policy if exists own_documents_read on public.electro_cloud_documents;
create policy own_documents_read on public.electro_cloud_documents
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists own_documents_insert on public.electro_cloud_documents;
create policy own_documents_insert on public.electro_cloud_documents
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists own_documents_delete on public.electro_cloud_documents;
create policy own_documents_delete on public.electro_cloud_documents
  for delete to authenticated using ((select auth.uid()) = owner_id);

commit;
