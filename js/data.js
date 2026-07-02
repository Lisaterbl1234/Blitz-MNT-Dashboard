import { supabase } from './supabaseClient.js';

/* ====== MNT RECORDS ====== */

export async function fetchMntRecords() {
  const { data, error } = await supabase.from('mnt_records').select('*').order('date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function insertMntRecord(record) {
  const { data, error } = await supabase.from('mnt_records').insert(record).select().single();
  if (error) throw error;
  return data;
}

export async function updateMntRecord(id, patch) {
  const { data, error } = await supabase.from('mnt_records').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMntRecord(id) {
  const { error } = await supabase.from('mnt_records').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkInsertMntRecords(records) {
  if (!records.length) return [];
  const { data, error } = await supabase.from('mnt_records').insert(records).select();
  if (error) throw error;
  return data;
}

/* ====== FTTB RECORDS ====== */

export async function fetchFttbRecords() {
  const { data, error } = await supabase.from('fttb_records').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function insertFttbRecord(record) {
  const { data, error } = await supabase.from('fttb_records').insert(record).select().single();
  if (error) throw error;
  return data;
}

export async function updateFttbRecord(id, patch) {
  const { data, error } = await supabase.from('fttb_records').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteFttbRecord(id) {
  const { error } = await supabase.from('fttb_records').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkInsertFttbRecords(records) {
  if (!records.length) return [];
  const { data, error } = await supabase.from('fttb_records').insert(records).select();
  if (error) throw error;
  return data;
}
