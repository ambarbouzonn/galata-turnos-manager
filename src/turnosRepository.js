import { getSupabaseClient } from './supabaseClient.js';
import { upsertDirectoryFromTurno } from './directoryRepository.js';

const STORAGE_KEY = 'galata-turnos';
const LEGACY_STORAGE_KEY = 'turnos-vete';
const SUPABASE_TABLE = 'turnos';

function parseTurnos(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getLocalTurnos() {
  return parseTurnos(localStorage.getItem(STORAGE_KEY));
}

function setLocalTurnos(turnos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(turnos));
}

async function readLegacyWindowStorage() {
  if (!window.storage || typeof window.storage.get !== 'function') {
    return [];
  }

  try {
    const res = await window.storage.get(LEGACY_STORAGE_KEY, true);
    return parseTurnos(res && res.value);
  } catch {
    return [];
  }
}

function toAppTurno(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    hora: row.hora ? row.hora.slice(0, 5) : '',
    dueno: row.dueno,
    mascota: row.mascota,
    tipoMascota: row.tipo_mascota || '',
    servicio: row.servicio,
    telefono: row.telefono || '',
    instagram: row.instagram || '',
    notas: row.notas || '',
    estado: row.estado,
    cargadoPor: row.cargado_por || '',
  };
}

function toDbTurno(turno) {
  return {
    id: turno.id,
    fecha: turno.fecha,
    hora: turno.hora,
    dueno: turno.dueno,
    mascota: turno.mascota,
    tipo_mascota: turno.tipoMascota || null,
    servicio: turno.servicio,
    telefono: turno.telefono || null,
    instagram: turno.instagram || null,
    notas: turno.notas || null,
    estado: turno.estado || 'pendiente',
    cargado_por: turno.cargadoPor || null,
  };
}

async function getRemoteTurnos() {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select('*')
    .order('fecha', { ascending: true })
    .order('hora', { ascending: true });

  if (error) throw error;
  return data.map(toAppTurno);
}

async function migrateLocalTurnosIfRemoteIsEmpty(remoteTurnos) {
  const localTurnos = getLocalTurnos();
  if (remoteTurnos.length > 0 || localTurnos.length === 0) return remoteTurnos;

  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from(SUPABASE_TABLE)
    .upsert(localTurnos.map(toDbTurno), { onConflict: 'id' });

  if (error) throw error;
  return localTurnos;
}

export async function getTurnos() {
  const remoteTurnos = await getRemoteTurnos();
  if (remoteTurnos) {
    const turnos = await migrateLocalTurnosIfRemoteIsEmpty(remoteTurnos);
    setLocalTurnos(turnos);
    return turnos;
  }

  const storedTurnos = getLocalTurnos();
  if (storedTurnos.length > 0) return storedTurnos;

  const legacyTurnos = await readLegacyWindowStorage();
  if (legacyTurnos.length > 0) {
    await saveTurnos(legacyTurnos);
  }
  return legacyTurnos;
}

export async function saveTurnos(turnos) {
  setLocalTurnos(turnos);
}

export async function saveTurno(turno) {
  const supabase = await getSupabaseClient();
  if (supabase) {
    await upsertDirectoryFromTurno(turno);

    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .upsert(toDbTurno(turno), { onConflict: 'id' });

    if (error) throw error;
  }

  const turnos = getLocalTurnos();
  const index = turnos.findIndex((item) => item.id === turno.id);
  if (index >= 0) {
    turnos[index] = turno;
  } else {
    turnos.push(turno);
  }
  setLocalTurnos(turnos);
}

export async function deleteTurno(id) {
  const supabase = await getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from(SUPABASE_TABLE).delete().eq('id', id);
    if (error) throw error;
  }

  setLocalTurnos(getLocalTurnos().filter((turno) => turno.id !== id));
}

export async function deleteAllTurnos() {
  localStorage.removeItem(STORAGE_KEY);
}
