# Galata Turnos Manager

Aplicacion web para gestionar turnos de veterinaria/peluqueria.

## Estado actual

- Calendario mensual responsive para saltar rapido entre fechas.
- Filtros rapidos por estado y resumen del dia.
- Acciones rapidas para confirmar, realizar o cancelar turnos.
- Accion rapida de WhatsApp con mensaje prearmado.
- Aviso inmediato de horario ocupado y selector de horarios sugeridos.
- Busqueda por duenio, mascota, telefono, servicio, tipo, notas o persona que cargo.
- Panel de proximos 7 dias.
- Detalle expandible de turno antes de editar.
- Alta, edicion y eliminacion de turnos.
- Busqueda por duenio/a o mascota.
- Integracion con Supabase para guardar turnos en la nube.
- Login con Supabase Auth.
- Perfiles del equipo con roles.
- Eliminacion de turnos limitada a rol `admin`.
- Bloqueo de dobles reservas por fecha y hora.
- Clientes y mascotas reutilizables con sugerencias en el formulario.
- Historial reciente de la mascota dentro del formulario de turno.
- Servidor local sin dependencias externas.

## Ejecutar

```bash
npm run dev
```

Luego abrir `http://localhost:5173`.

## Conectar Supabase

1. Crear un proyecto en Supabase.
2. Abrir SQL Editor y ejecutar `database/supabase.sql`.
3. Copiar Project URL y publishable/anon key.
4. Pegarlos en `src/appConfig.js`.
5. Reiniciar la app.

Mientras `src/appConfig.js` no tenga credenciales, la app sigue usando `localStorage`.

## Activar login

1. En Supabase, ir a Authentication > Users.
2. Crear los usuarios del equipo con email y contrasena.
3. Probar ingresar desde la app con uno de esos usuarios.
4. Ejecutar `database/user-profiles.sql` en SQL Editor.
5. Cuando el login funcione, ejecutar `database/authenticated-policies.sql` en SQL Editor.

Ese SQL cambia los permisos para que solo usuarios autenticados puedan leer, crear, editar turnos, y solo `admin` pueda eliminarlos.

## Perfiles y roles

Cada usuario nuevo de Supabase Auth queda con rol `staff` por defecto. Para cambiar nombre o rol:

```sql
update public.user_profiles
set display_name = 'Ambar', role = 'admin'
where user_id = (
  select id from auth.users where email = 'TU_EMAIL'
);
```

Roles disponibles: `admin`, `peluquera`, `recepcion`, `staff`.

Si ya tenias las politicas autenticadas aplicadas y solo queres activar el borrado exclusivo para admin, ejecuta `database/admin-delete-policy.sql`.

## Evitar dobles reservas

Ejecutar `database/prevent-double-booking.sql` en SQL Editor para impedir que haya dos turnos activos con la misma fecha y hora.

Los turnos con estado `cancelado` no ocupan horario.

## Clientes y mascotas

Ejecutar `database/clients-and-pets.sql` en SQL Editor para crear las tablas `clientes` y `mascotas`.

El SQL tambien migra automaticamente los clientes y mascotas que ya existan dentro de los turnos cargados.
