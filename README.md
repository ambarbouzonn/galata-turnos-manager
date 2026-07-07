# Galata Turnos Manager

Aplicación web para gestionar la agenda operativa de una veterinaria/peluquería canina. El proyecto centraliza turnos de peluquería, cirugías, datos de clientes y mascotas, con foco en una experiencia simple para uso diario desde celular.

## Descripción

Galata Turnos Manager nace como una herramienta interna para ordenar reservas, reducir dobles asignaciones de horario y facilitar la coordinación del equipo. La app permite trabajar con una agenda mensual, registrar turnos y cirugías, consultar historial de mascotas, contactar clientes rápidamente y controlar permisos por rol.

El sistema funciona con Supabase como backend principal y mantiene un modo local con `localStorage` para desarrollo o uso sin configuración de nube.

## Funcionalidades principales

- Calendario mensual responsive con vista diaria.
- Alta, edición, eliminación y cambio de estado de turnos.
- Estados de turno: pendiente, confirmado, realizado y cancelado.
- Bloqueo de dobles reservas activas por fecha y hora.
- Selector rápido de horarios sugeridos.
- Agenda separada para cirugías.
- Detección de cruces entre cirugías y turnos de peluquería.
- Búsqueda por dueño, mascota, teléfono, servicio, procedimiento, notas o responsable de carga.
- Panel de próximos turnos.
- Aviso de turnos pendientes del día.
- Acciones rápidas de llamada, WhatsApp e Instagram.
- Mensaje de WhatsApp prearmado para recordatorios.
- Clientes y mascotas reutilizables con autocompletado.
- Historial reciente de cada mascota dentro del formulario.
- Autenticación con Supabase Auth.
- Perfiles de equipo con roles.
- Eliminación restringida a usuarios administradores.
- Persistencia local como fallback cuando Supabase no está configurado.

## Stack técnico

- HTML5, CSS3 y JavaScript moderno.
- Módulos ES nativos en el navegador.
- Supabase Auth para autenticación.
- Supabase Postgres para persistencia.
- Row Level Security y policies SQL.
- Servidor local minimalista con Node.js.
- Sin framework frontend, priorizando bajo peso, carga rápida y mantenimiento directo.

## Arquitectura

```text
.
├── index.html
├── styles.css
├── script.js
├── server.mjs
├── src
│   ├── appConfig.js
│   ├── authRepository.js
│   ├── cirugiasRepository.js
│   ├── directoryRepository.js
│   ├── supabaseClient.js
│   └── turnosRepository.js
└── database
    ├── supabase.sql
    ├── authenticated-policies.sql
    ├── user-profiles.sql
    ├── clients-and-pets.sql
    ├── prevent-double-booking.sql
    ├── admin-delete-policy.sql
    └── cirugias.sql
```

La lógica de persistencia está separada en repositorios para mantener aislado el acceso a Supabase y el fallback local. La interfaz está concentrada en una única experiencia de calendario, con pestañas para agenda de peluquería y agenda de cirugías.

## Ejecutar localmente

Requisitos:

- Node.js 18 o superior.

Instalación y ejecución:

```bash
npm install
npm run dev
```

Luego abrir:

```text
http://localhost:5173
```

## Configuración de Supabase

1. Crear un proyecto en Supabase.
2. Ejecutar `database/supabase.sql` desde el SQL Editor.
3. Configurar `src/appConfig.js` con la Project URL y la publishable/anon key.
4. Crear usuarios desde Authentication > Users.
5. Ejecutar `database/user-profiles.sql`.
6. Ejecutar `database/authenticated-policies.sql` para restringir el acceso a usuarios autenticados.
7. Ejecutar los scripts opcionales según las funcionalidades que se quieran activar:
   - `database/prevent-double-booking.sql`
   - `database/clients-and-pets.sql`
   - `database/cirugias.sql`
   - `database/admin-delete-policy.sql`

Mientras Supabase no esté configurado, la app funciona en modo local usando `localStorage`. En modo local los datos no se comparten entre dispositivos.

## Roles

Roles disponibles:

- `admin`
- `peluquera`
- `recepcion`
- `staff`

Ejemplo para asignar rol y nombre visible:

```sql
update public.user_profiles
set display_name = 'Nombre del usuario', role = 'admin'
where user_id = (
  select id from auth.users where email = 'usuario@email.com'
);
```

## Base de datos

Tablas principales:

- `turnos`: agenda de peluquería.
- `cirugias`: agenda quirúrgica.
- `clientes`: datos reutilizables de clientes.
- `mascotas`: datos reutilizables de mascotas.
- `user_profiles`: perfil y rol de cada usuario autenticado.

La tabla `turnos` puede usar un índice único parcial para impedir dobles reservas activas en el mismo día y horario, permitiendo que los turnos cancelados liberen el espacio.

## Seguridad

El proyecto utiliza Supabase Auth y Row Level Security. Las policies incluidas permiten:

- Lectura y escritura solo para usuarios autenticados.
- Eliminación de turnos limitada a usuarios con rol `admin`.
- Creación automática de perfil para usuarios nuevos.

## Estado del proyecto

Proyecto funcional en evolución. La aplicación ya cubre el flujo principal de agenda diaria, coordinación de cirugía/peluquería, autenticación, roles y persistencia en Supabase.

Próximas mejoras posibles:

- Tests automatizados para validaciones críticas.
- Migraciones SQL versionadas.
- Exportación de agenda diaria.
- Filtros por responsable o tipo de servicio.
- Mejoras de accesibilidad y navegación con teclado.

## Autor

Desarrollado como solución práctica para gestión real de turnos, priorizando simplicidad operativa, claridad visual y bajo costo de mantenimiento.
