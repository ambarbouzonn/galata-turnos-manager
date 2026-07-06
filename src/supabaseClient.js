import { APP_CONFIG } from './appConfig.js';

let supabaseClient = null;

export function isSupabaseConfigured() {
  return Boolean(APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseKey);
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (supabaseClient) return supabaseClient;

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabaseClient = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);
  return supabaseClient;
}
