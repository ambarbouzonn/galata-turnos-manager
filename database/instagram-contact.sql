alter table public.turnos
add column if not exists instagram text;

alter table public.clientes
add column if not exists instagram text;
