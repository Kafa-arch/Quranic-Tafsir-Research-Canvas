-- QTRC+ Supabase schema
-- Run this once in Supabase -> SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create table if not exists public.qtrc_canvases (
  user_id uuid not null references auth.users(id) on delete cascade,
  id bigint not null,
  name text not null,
  mode text not null,
  level text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.qtrc_canvases enable row level security;

drop policy if exists "qtrc_canvases_select_own" on public.qtrc_canvases;
create policy "qtrc_canvases_select_own"
on public.qtrc_canvases
for select
using (auth.uid() = user_id);

drop policy if exists "qtrc_canvases_insert_own" on public.qtrc_canvases;
create policy "qtrc_canvases_insert_own"
on public.qtrc_canvases
for insert
with check (auth.uid() = user_id);

drop policy if exists "qtrc_canvases_update_own" on public.qtrc_canvases;
create policy "qtrc_canvases_update_own"
on public.qtrc_canvases
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "qtrc_canvases_delete_own" on public.qtrc_canvases;
create policy "qtrc_canvases_delete_own"
on public.qtrc_canvases
for delete
using (auth.uid() = user_id);

-- Private research material bucket.
insert into storage.buckets (id, name, public)
values ('qtrc-research', 'qtrc-research', false)
on conflict (id) do nothing;

drop policy if exists "qtrc_research_insert_own" on storage.objects;
create policy "qtrc_research_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'qtrc-research'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "qtrc_research_select_own" on storage.objects;
create policy "qtrc_research_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'qtrc-research'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "qtrc_research_delete_own" on storage.objects;
create policy "qtrc_research_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'qtrc-research'
  and (storage.foldername(name))[1] = auth.uid()::text
);
