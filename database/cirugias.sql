create table if not exists public.cirugias (
  id text primary key,
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  dueno text not null,
  mascota text not null,
  tipo_mascota text,
  procedimiento text not null,
  telefono text,
  notas text,
  estado text not null default 'programada'
    check (estado in ('programada', 'confirmada', 'realizada', 'cancelada')),
  cargado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cirugias_horario_valido check (hora_fin > hora_inicio)
);

drop trigger if exists cirugias_set_updated_at on public.cirugias;

create trigger cirugias_set_updated_at
before update on public.cirugias
for each row
execute function public.set_updated_at();

alter table public.cirugias enable row level security;

grant select, insert, update, delete on public.cirugias to authenticated;

drop policy if exists "cirugias_select_authenticated" on public.cirugias;
drop policy if exists "cirugias_insert_authenticated" on public.cirugias;
drop policy if exists "cirugias_update_authenticated" on public.cirugias;
drop policy if exists "cirugias_delete_authenticated" on public.cirugias;

create policy "cirugias_select_authenticated"
on public.cirugias
for select
to authenticated
using (true);

create policy "cirugias_insert_authenticated"
on public.cirugias
for insert
to authenticated
with check (true);

create policy "cirugias_update_authenticated"
on public.cirugias
for update
to authenticated
using (true)
with check (true);

create policy "cirugias_delete_authenticated"
on public.cirugias
for delete
to authenticated
using (true);
