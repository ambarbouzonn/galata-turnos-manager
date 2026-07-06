import { getSupabaseClient } from './supabaseClient.js';

function normalizeName(value) {
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function uniqueBy(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    if (key && !map.has(key)) map.set(key, item);
  });
  return Array.from(map.values());
}

export function buildDirectoryFromTurnos(turnos) {
  const clientes = uniqueBy(
    turnos
      .filter((turno) => turno.dueno)
      .map((turno) => ({
        nombre: turno.dueno,
        nombreNormalizado: normalizeName(turno.dueno),
        telefono: turno.telefono || '',
      })),
    (cliente) => cliente.nombreNormalizado
  );

  const mascotas = uniqueBy(
    turnos
      .filter((turno) => turno.dueno && turno.mascota)
      .map((turno) => ({
        clienteNombre: turno.dueno,
        clienteNormalizado: normalizeName(turno.dueno),
        nombre: turno.mascota,
        nombreNormalizado: normalizeName(turno.mascota),
        tipoMascota: turno.tipoMascota || '',
      })),
    (mascota) => `${mascota.clienteNormalizado}::${mascota.nombreNormalizado}`
  );

  return { clientes, mascotas };
}

export async function getDirectory(turnos) {
  const fallback = buildDirectoryFromTurnos(turnos);
  const supabase = await getSupabaseClient();
  if (!supabase) return fallback;

  try {
    const [{ data: clientes, error: clientesError }, { data: mascotas, error: mascotasError }] = await Promise.all([
      supabase.from('clientes').select('id, nombre, nombre_normalizado, telefono').order('nombre'),
      supabase.from('mascotas').select('id, cliente_id, nombre, nombre_normalizado, tipo_mascota, clientes(nombre, nombre_normalizado)').order('nombre'),
    ]);

    if (clientesError || mascotasError) return fallback;

    return {
      clientes: clientes.map((cliente) => ({
        id: cliente.id,
        nombre: cliente.nombre,
        nombreNormalizado: cliente.nombre_normalizado,
        telefono: cliente.telefono || '',
      })),
      mascotas: mascotas.map((mascota) => ({
        id: mascota.id,
        clienteId: mascota.cliente_id,
        clienteNombre: mascota.clientes ? mascota.clientes.nombre : '',
        clienteNormalizado: mascota.clientes ? mascota.clientes.nombre_normalizado : '',
        nombre: mascota.nombre,
        nombreNormalizado: mascota.nombre_normalizado,
        tipoMascota: mascota.tipo_mascota || '',
      })),
    };
  } catch {
    return fallback;
  }
}

export async function upsertDirectoryFromTurno(turno) {
  const supabase = await getSupabaseClient();
  if (!supabase || !turno.dueno || !turno.mascota) return;

  const clientePayload = {
    nombre: turno.dueno,
    nombre_normalizado: normalizeName(turno.dueno),
    telefono: turno.telefono || null,
  };

  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .upsert(clientePayload, { onConflict: 'nombre_normalizado' })
    .select('id')
    .single();

  if (clienteError || !cliente) return;

  const mascotaPayload = {
    cliente_id: cliente.id,
    nombre: turno.mascota,
    nombre_normalizado: normalizeName(turno.mascota),
    tipo_mascota: turno.tipoMascota || null,
    notas: turno.notas || null,
  };

  await supabase
    .from('mascotas')
    .upsert(mascotaPayload, { onConflict: 'cliente_id,nombre_normalizado' });
}
