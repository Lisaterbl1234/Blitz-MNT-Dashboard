// Publishable key is safe to commit here — Row Level Security on
// mnt_records/fttb_records/storage.objects is what actually gates access,
// not secrecy of this key. Never put a secret key in this file.
const SUPABASE_URL = 'https://pznocsegnqxhgumfxdui.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ro9PloMG8664tGesrfl86g_fSg1Zgrf';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
