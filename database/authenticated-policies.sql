drop policy if exists "turnos_select_public" on public.turnos;
drop policy if exists "turnos_insert_public" on public.turnos;
drop policy if exists "turnos_update_public" on public.turnos;
drop policy if exists "turnos_delete_public" on public.turnos;

drop policy if exists "turnos_select_authenticated" on public.turnos;
drop policy if exists "turnos_insert_authenticated" on public.turnos;
drop policy if exists "turnos_update_authenticated" on public.turnos;
drop policy if exists "turnos_delete_authenticated" on public.turnos;
drop policy if exists "turnos_delete_admin" on public.turnos;

alter table public.turnos enable row level security;

revoke all on public.turnos from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.turnos to authenticated;

create policy "turnos_select_authenticated"
on public.turnos
for select
to authenticated
using (true);

create policy "turnos_insert_authenticated"
on public.turnos
for insert
to authenticated
with check (true);

create policy "turnos_update_authenticated"
on public.turnos
for update
to authenticated
using (true)
with check (true);

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.user_profiles
  where user_id = auth.uid()
$$;

grant execute on function public.current_user_role() to authenticated;

create policy "turnos_delete_admin"
on public.turnos
for delete
to authenticated
using (public.current_user_role() = 'admin');
