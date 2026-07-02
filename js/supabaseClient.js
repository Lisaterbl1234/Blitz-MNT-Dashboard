// Fill these in from Supabase Dashboard -> Project Settings -> API,
// after running supabase/schema.sql (see README.md step-by-step setup).
// The anon/public key is safe to commit here — Row Level Security on
// mnt_records/fttb_records/storage.objects is what actually gates access,
// not secrecy of this key. Never put the service_role key in this file.
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
