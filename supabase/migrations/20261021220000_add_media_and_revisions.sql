create table if not exists public.charter_revisions (
  id bigint generated always as identity primary key,
  charter_id text not null default 'main',
  revision bigint not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (charter_id, revision)
);

alter table public.charter_revisions enable row level security;
grant select on public.charter_revisions to authenticated;
revoke insert, update, delete on public.charter_revisions from authenticated;
revoke all on sequence public.charter_revisions_id_seq from authenticated;
revoke all on public.charter_revisions from anon;

drop policy if exists "charter_revision_owner_read" on public.charter_revisions;
create policy "charter_revision_owner_read"
on public.charter_revisions for select
to authenticated
using (lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'qloxzick@gmail.com');

drop policy if exists "charter_revision_owner_insert" on public.charter_revisions;
create policy "charter_revision_owner_insert"
on public.charter_revisions for insert
to authenticated
with check (lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'qloxzick@gmail.com');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portia-media',
  'portia-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "portia_media_public_read" on storage.objects;
create policy "portia_media_public_read"
on storage.objects for select
to public
using (bucket_id = 'portia-media');

drop policy if exists "portia_media_owner_insert" on storage.objects;
create policy "portia_media_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'portia-media'
  and lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'qloxzick@gmail.com'
);

drop policy if exists "portia_media_owner_update" on storage.objects;
create policy "portia_media_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'portia-media'
  and lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'qloxzick@gmail.com'
)
with check (
  bucket_id = 'portia-media'
  and lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'qloxzick@gmail.com'
);

drop policy if exists "portia_media_owner_delete" on storage.objects;
create policy "portia_media_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'portia-media'
  and lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'qloxzick@gmail.com'
);

create or replace function public.update_charter(
  p_expected_revision bigint,
  p_content jsonb
) returns public.charter_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.charter_state;
  v_row public.charter_state;
begin
  if lower(coalesce((select auth.jwt()) ->> 'email', '')) <> 'qloxzick@gmail.com' then
    raise insufficient_privilege using message = 'owner_only';
  end if;

  select * into v_current
  from public.charter_state
  where id = 'main' and revision = p_expected_revision
  for update;

  if not found then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;

  insert into public.charter_revisions (charter_id, revision, content, created_by)
  values (v_current.id, v_current.revision, v_current.content, auth.uid())
  on conflict (charter_id, revision) do nothing;

  update public.charter_state
  set content = p_content,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where id = v_current.id
  returning * into v_row;

  return v_row;
end;
$$;

-- All writes must pass through update_charter so no client can skip the
-- revision snapshot or optimistic-concurrency check with a direct REST update.
revoke update on public.charter_state from authenticated;
revoke all on function public.update_charter(bigint, jsonb) from public, anon;
grant execute on function public.update_charter(bigint, jsonb) to authenticated;
