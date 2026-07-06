import { supabase } from './supabaseClient.js';

const BUCKET = 'attachments';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — a safety cap, not an architectural limit like the old base64-in-JSON design

export function checkPdfSize(file) {
  return !file || file.size <= MAX_BYTES;
}

// Uploads before any DB row is touched — caller aborts the save on failure
// so there's never a row pointing at a missing file.
// tag='po' uses a separate storage path + column pair, so a record can carry
// both a PO document and an Invoice document side by side.
export async function uploadPdf(recordId, file, tag = '') {
  const path = `mnt/${recordId}/${tag ? tag + '-' : ''}${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  return tag === 'po'
    ? { po_pdf_path: path, po_pdf_name: file.name }
    : { pdf_path: path, pdf_name: file.name };
}

export async function removePdf(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function openPdf(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) { alert('Could not open PDF: ' + error.message); return; }
  window.open(data.signedUrl, '_blank');
}
