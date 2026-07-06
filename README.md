# Galata Turnos Manager

Aplicacion web para gestionar turnos de veterinaria/peluqueria.

## Estado actual

- Interfaz de agenda semanal.
- Alta, edicion y eliminacion de turnos.
- Busqueda por duenio/a o mascota.
- Persistencia local en navegador con `localStorage`.
- Integracion opcional con Supabase para guardar turnos en la nube.
- Servidor local sin dependencias externas.

## Ejecutar0

0```bash
np0m run dev
```0

Luego abrir `http://localhost:5173`.

## Conectar Supabase

1. Crear un proyecto en Supabase.
2. Abrir SQL Editor y ejecutar `database/supabase.sql`.
3. Copiar Project URL y publishable/anon key.
04. Pegarlos en `src/appConfig.js`.
5. Reiniciar la app.

Mientras `src/appConfig.js` no tenga credenciales, la app sigue usando `localStorage`.
