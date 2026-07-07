import { getSupabaseClient } from './supabaseClient.js';

const STORAGE_KEY = 'galata-cirugias';
const SUPABASE_TABLE = 'cirugias';

function parseCirugias(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getLocalCirugias() {
  return parseCirugias(localStorage.getItem(STORAGE_KEY));
}

function setLocalCirugias(cirugias) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cirugias));
}

function isMissingTableError(error) {
  const message = `${error && error.message ? error.message : ''} ${error && error.details ? error.details : ''}`.toLowerCase();
  return message.includes('cirugias') && (message.includes('does not exist') || message.includes('schema cache') || message.includes('relation'));
}

function toAppCirugia(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    horaInicio: row.hora_inicio ? row.hora_inicio.slice(0, 5) : '',
    horaFin: row.hora_fin ? row.hora_fin.slice(0, 5) : '',
    dueno: row.dueno,
    mascota: row.mascota,
    tipoMascota: row.tipo_mascota || '',
    procedimiento: row.procedimiento,
    telefono: row.telefono || '',
    notas: row.notas || '',
    estado: row.estado,
    cargadoPor: row.cargado_por || '',
  };
}

function toDbCirugia(cirugia) {
  return {
    id: cirugia.id,
    fecha: cirugia.fecha,
    hora_inicio: cirugia.horaInicio,
    hora_fin: cirugia.horaFin,
    dueno: cirugia.dueno,
    mascota: cirugia.mascota,
    tipo_mascota: cirugia.tipoMascota || null,
    procedimiento: cirugia.procedimiento,
    telefono: cirugia.telefono || null,
    notas: cirugia.notas || null,
    estado: cirugia.estado || 'programada',
    cargado_por: cirugia.cargadoPor || null,
  };
}

async function getRemoteCirugias() {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select('*')
    .order('fecha', { ascending: true })
    .order('hora_inicio', { ascending: true });

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return data.map(toAppCirugia);
}

export async function getCirugias() {
  const remoteCirugias = await getRemoteCirugias();
  if (remoteCirugias) {
    setLocalCirugias(remoteCirugias);
    return remoteCirugias;
  }

  return getLocalCirugias();
}

export async function saveCirugia(cirugia) {
  const supabase = await getSupabaseClient();
  if (supabase) {
    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .upsert(toDbCirugia(cirugia), { onConflict: 'id' });

    if (error && !isMissingTableError(error)) throw error;
  }

  const cirugias = getLocalCirugias();
  const index = cirugias.findIndex((item) => item.id === cirugia.id);
  if (index >= 0) {
    cirugias[index] = cirugia;
  } else {
    cirugias.push(cirugia);
  }
  setLocalCirugias(cirugias);
}

export async function deleteCirugia(id) {
  const supabase = await getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from(SUPABASE_TABLE).delete().eq('id', id);
    if (error && !isMissingTableError(error)) throw error;
  }

  setLocalCirugias(getLocalCirugias().filter((cirugia) => cirugia.id !== id));
}
