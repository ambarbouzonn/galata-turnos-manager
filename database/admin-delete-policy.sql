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

drop policy if exists "turnos_delete_authenticated" on public.turnos;
drop policy if exists "turnos_delete_admin" on public.turnos;

create policy "turnos_delete_admin"
on public.turnos
for delete
to authenticated
using (public.current_user_role() = 'admin');
