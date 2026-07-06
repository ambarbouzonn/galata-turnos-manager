create table if not exists public.turnos (
  id text primary key,
  fecha date not null,
  hora time not null,
  dueno text not null,
  mascota text not null,
  tipo_mascota text,
  servicio text not null,
  telefono text,
  instagram text,
  notas text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'realizado', 'cancelado')),
  cargado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists turnos_set_updated_at on public.turnos;

create trigger turnos_set_updated_at
before update on public.turnos
for each row
execute function public.set_updated_at();

create unique index if not exists turnos_unique_active_slot
on public.turnos (fecha, hora)
where estado <> 'cancelado';

alter table public.turnos
add column if not exists instagram text;

alter table public.turnos enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.turnos to anon;

drop policy if exists "turnos_select_public" on public.turnos;
drop policy if exists "turnos_insert_public" on public.turnos;
drop policy if exists "turnos_update_public" on public.turnos;
drop policy if exists "turnos_delete_public" on public.turnos;

create policy "turnos_select_public"
on public.turnos
for select
to anon
using (true);

create policy "turnos_insert_public"
on public.turnos
for insert
to anon
with check (true);

create policy "turnos_update_public"
on public.turnos
for update
to anon
using (true)
with check (true);

create policy "turnos_delete_public"
on public.turnos
for delete
to anon
using (true);
