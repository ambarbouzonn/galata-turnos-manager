create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_normalizado text not null unique,
  telefono text,
  instagram text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mascotas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre text not null,
  nombre_normalizado text not null,
  tipo_mascota text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, nombre_normalizado)
);

alter table public.clientes
add column if not exists instagram text;

drop trigger if exists clientes_set_updated_at on public.clientes;
drop trigger if exists mascotas_set_updated_at on public.mascotas;

create trigger clientes_set_updated_at
before update on public.clientes
for each row
execute function public.set_updated_at();

create trigger mascotas_set_updated_at
before update on public.mascotas
for each row
execute function public.set_updated_at();

alter table public.clientes enable row level security;
alter table public.mascotas enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.clientes to authenticated;
grant select, insert, update on public.mascotas to authenticated;

drop policy if exists "clientes_select_authenticated" on public.clientes;
drop policy if exists "clientes_insert_authenticated" on public.clientes;
drop policy if exists "clientes_update_authenticated" on public.clientes;
drop policy if exists "mascotas_select_authenticated" on public.mascotas;
drop policy if exists "mascotas_insert_authenticated" on public.mascotas;
drop policy if exists "mascotas_update_authenticated" on public.mascotas;

create policy "clientes_select_authenticated"
on public.clientes
for select
to authenticated
using (true);

create policy "clientes_insert_authenticated"
on public.clientes
for insert
to authenticated
with check (true);

create policy "clientes_update_authenticated"
on public.clientes
for update
to authenticated
using (true)
with check (true);

create policy "mascotas_select_authenticated"
on public.mascotas
for select
to authenticated
using (true);

create policy "mascotas_insert_authenticated"
on public.mascotas
for insert
to authenticated
with check (true);

create policy "mascotas_update_authenticated"
on public.mascotas
for update
to authenticated
using (true)
with check (true);

insert into public.clientes (nombre, nombre_normalizado, telefono, instagram)
select distinct on (lower(regexp_replace(trim(dueno), '\s+', ' ', 'g')))
  trim(dueno),
  lower(regexp_replace(trim(dueno), '\s+', ' ', 'g')),
  nullif(trim(coalesce(telefono, '')), ''),
  nullif(trim(coalesce(instagram, '')), '')
from public.turnos
where nullif(trim(coalesce(dueno, '')), '') is not null
order by lower(regexp_replace(trim(dueno), '\s+', ' ', 'g')), updated_at desc
on conflict (nombre_normalizado) do update
set
  nombre = excluded.nombre,
  telefono = coalesce(excluded.telefono, public.clientes.telefono),
  instagram = coalesce(excluded.instagram, public.clientes.instagram);

insert into public.mascotas (cliente_id, nombre, nombre_normalizado, tipo_mascota, notas)
select distinct on (
  c.id,
  lower(regexp_replace(trim(t.mascota), '\s+', ' ', 'g'))
)
  c.id,
  trim(t.mascota),
  lower(regexp_replace(trim(t.mascota), '\s+', ' ', 'g')),
  nullif(trim(coalesce(t.tipo_mascota, '')), ''),
  nullif(trim(coalesce(t.notas, '')), '')
from public.turnos t
join public.clientes c
  on c.nombre_normalizado = lower(regexp_replace(trim(t.dueno), '\s+', ' ', 'g'))
where nullif(trim(coalesce(t.dueno, '')), '') is not null
  and nullif(trim(coalesce(t.mascota, '')), '') is not null
order by
  c.id,
  lower(regexp_replace(trim(t.mascota), '\s+', ' ', 'g')),
  t.updated_at desc
on conflict (cliente_id, nombre_normalizado) do update
set
  nombre = excluded.nombre,
  tipo_mascota = coalesce(excluded.tipo_mascota, public.mascotas.tipo_mascota),
  notas = coalesce(excluded.notas, public.mascotas.notas);
