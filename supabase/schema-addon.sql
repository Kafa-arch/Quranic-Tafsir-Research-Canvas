-- QTRC Evidence Layer v1
-- Run after the existing supabase/schema.sql.

create table if not exists public.qtrc_library_documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  storage_bucket text not null default 'qtrc-research',
  storage_path text not null,
  extracted_chars integer not null default 0,
  content_hash text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, storage_bucket, storage_path)
);

alter table public.qtrc_library_documents enable row level security;

drop policy if exists "qtrc_library_documents_select_own" on public.qtrc_library_documents;
create policy "qtrc_library_documents_select_own"
on public.qtrc_library_documents
for select using (auth.uid() = user_id);

drop policy if exists "qtrc_library_documents_insert_own" on public.qtrc_library_documents;
create policy "qtrc_library_documents_insert_own"
on public.qtrc_library_documents
for insert with check (auth.uid() = user_id);

drop policy if exists "qtrc_library_documents_update_own" on public.qtrc_library_documents;
create policy "qtrc_library_documents_update_own"
on public.qtrc_library_documents
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "qtrc_library_documents_delete_own" on public.qtrc_library_documents;
create policy "qtrc_library_documents_delete_own"
on public.qtrc_library_documents
for delete using (auth.uid() = user_id);

create index if not exists qtrc_library_documents_user_updated_idx
on public.qtrc_library_documents(user_id, updated_at desc);

create table if not exists public.qtrc_library_chunks (
  id uuid primary key,
  document_id uuid not null references public.qtrc_library_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_name text not null,
  mime_type text,
  chunk_index integer not null,
  chunk_label text not null,
  content_text text not null,
  content_hash text,
  created_at timestamptz not null default now()
);

alter table public.qtrc_library_chunks enable row level security;

drop policy if exists "qtrc_library_chunks_select_own" on public.qtrc_library_chunks;
create policy "qtrc_library_chunks_select_own"
on public.qtrc_library_chunks
for select using (auth.uid() = user_id);

drop policy if exists "qtrc_library_chunks_insert_own" on public.qtrc_library_chunks;
create policy "qtrc_library_chunks_insert_own"
on public.qtrc_library_chunks
for insert with check (auth.uid() = user_id);

drop policy if exists "qtrc_library_chunks_update_own" on public.qtrc_library_chunks;
create policy "qtrc_library_chunks_update_own"
on public.qtrc_library_chunks
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "qtrc_library_chunks_delete_own" on public.qtrc_library_chunks;
create policy "qtrc_library_chunks_delete_own"
on public.qtrc_library_chunks
for delete using (auth.uid() = user_id);

create index if not exists qtrc_library_chunks_user_doc_idx
on public.qtrc_library_chunks(user_id, document_id, chunk_index);

create index if not exists qtrc_library_chunks_text_idx
on public.qtrc_library_chunks using gin (to_tsvector('simple', content_text));
