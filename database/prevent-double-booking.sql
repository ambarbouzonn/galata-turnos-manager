create unique index if not exists turnos_unique_active_slot
on public.turnos (fecha, hora)
where estado <> 'cancelado';
