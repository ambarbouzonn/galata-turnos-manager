import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';

export async function getCurrentSession() {
  if (!isSupabaseConfigured()) {
    return {
      user: { email: 'modo-local@galata' },
      profile: { displayName: 'Modo local', role: 'admin' },
      isLocalMode: true,
    };
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const user = data.session ? data.session.user : null;
  return { user, profile: user ? await getUserProfile(user) : null, isLocalMode: false };
}

export async function signIn(email, password) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase no esta configurado.');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: data.user, profile: await getUserProfile(data.user) };
}

export async function signOut() {
  const supabase = await getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function onAuthChange(callback) {
  const supabase = await getSupabaseClient();
  if (!supabase) return () => {};

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ? session.user : null);
  });

  return () => data.subscription.unsubscribe();
}

export async function getUserProfile(user) {
  if (!user) return null;

  const supabase = await getSupabaseClient();
  if (!supabase) return { displayName: user.email || 'Modo local', role: 'admin' };

  const { data, error } = await supabase
    .from('user_profiles')
    .select('display_name, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;

  return {
    displayName: data ? data.display_name : user.email,
    role: data ? data.role : 'staff',
  };
}
