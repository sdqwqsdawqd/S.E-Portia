create table if not exists public.charter_state (
  id text primary key check (id = 'main'),
  content jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.charter_state enable row level security;

grant select on public.charter_state to anon, authenticated;
grant update on public.charter_state to authenticated;
revoke insert, delete on public.charter_state from anon, authenticated;

drop policy if exists "charter_public_read" on public.charter_state;
create policy "charter_public_read"
on public.charter_state for select
to anon, authenticated
using (true);

drop policy if exists "charter_owner_update" on public.charter_state;
create policy "charter_owner_update"
on public.charter_state for update
to authenticated
using (lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'qloxzick@gmail.com')
with check (lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'qloxzick@gmail.com');

insert into public.charter_state (id, content)
values ('main', '{"__styles":"{}"}'::jsonb)
on conflict (id) do nothing;

create or replace function public.update_charter(
  p_expected_revision bigint,
  p_content jsonb
) returns public.charter_state
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.charter_state;
begin
  if lower(coalesce((select auth.jwt()) ->> 'email', '')) <> 'qloxzick@gmail.com' then
    raise insufficient_privilege using message = 'owner_only';
  end if;

  update public.charter_state
  set content = p_content,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where id = 'main' and revision = p_expected_revision
  returning * into v_row;

  if not found then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;

  return v_row;
end;
$$;

revoke all on function public.update_charter(bigint, jsonb) from public, anon;
grant execute on function public.update_charter(bigint, jsonb) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.charter_state;
exception
  when duplicate_object then null;
end $$;
