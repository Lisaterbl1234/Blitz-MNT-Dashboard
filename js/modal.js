import { state } from './state.js';
import { insertMntRecord, updateMntRecord, insertFttbRecord, updateFttbRecord } from './data.js';
import { renderTable, renderFttb } from './render.js';
import { checkPdfSize, uploadPdf, removePdf, openPdf } from './pdfUpload.js';
import { extractPdfText, parsePoInvoice } from './pdfParse.js';

/* ====== MNT MODAL ====== */
export function openAddModal() {
  state.editId = null;
  document.getElementById('m-title').textContent = 'Add Quote / PO';
  ['m-date', 'm-expiry', 'm-docno', 'm-ref', 'm-amount', 'm-rep', 'm-notes', 'm-po-number', 'm-invoice-number'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('m-status').value = 'outstanding';
  document.getElementById('m-pdf').value = '';
  document.getElementById('m-pdf-cur').textContent = '';
  document.getElementById('m-po-pdf').value = '';
  document.getElementById('m-po-pdf-cur').textContent = '';
  document.getElementById('add-ov').classList.add('open');
}

export function openEdit(id) {
  const r = state.records.find(x => x.id === id);
  if (!r) return;
  state.editId = id;
  document.getElementById('m-title').textContent = 'Edit Record';
  document.getElementById('m-date').value = r.date || '';
  document.getElementById('m-expiry').value = r.expiry || '';
  document.getElementById('m-docno').value = r.doc_no || '';
  document.getElementById('m-ref').value = r.ref || '';
  document.getElementById('m-amount').value = r.amount || '';
  document.getElementById('m-rep').value = r.rep || '';
  document.getElementById('m-status').value = r.mnt_status || 'outstanding';
  document.getElementById('m-notes').value = r.notes || '';
  document.getElementById('m-po-number').value = r.po_number || '';
  document.getElementById('m-invoice-number').value = r.invoice_number || '';
  document.getElementById('m-pdf').value = '';
  document.getElementById('m-pdf-cur').textContent = r.pdf_name ? 'Current: ' + r.pdf_name : '';
  document.getElementById('m-po-pdf').value = '';
  document.getElementById('m-po-pdf-cur').textContent = r.po_pdf_name ? 'Current: ' + r.po_pdf_name : '';
  document.getElementById('add-ov').classList.add('open');
}

// Reads the PDF's text layer and fills PO/Invoice number fields, but only
// when they're still empty — never overwrites a manual edit.
export async function autoFillFromPdf(file) {
  if (!file) return;
  try {
    const text = await extractPdfText(file);
    const { poNumber, invoiceNumber } = parsePoInvoice(text);
    const poEl = document.getElementById('m-po-number');
    const invEl = document.getElementById('m-invoice-number');
    if (poNumber && !poEl.value.trim()) poEl.value = poNumber;
    if (invoiceNumber && !invEl.value.trim()) invEl.value = invoiceNumber;
  } catch (e) {
    console.warn('PDF auto-read failed:', e.message);
  }
}

export function closeAddModal() {
  document.getElementById('add-ov').classList.remove('open');
}

export async function saveModal() {
  const saveBtn = document.getElementById('m-save-btn');
  const d = {
    date: document.getElementById('m-date').value || null,
    expiry: document.getElementById('m-expiry').value || null,
    doc_no: document.getElementById('m-docno').value.trim(),
    ref: document.getElementById('m-ref').value.trim(),
    amount: parseFloat(document.getElementById('m-amount').value) || 0,
    rep: document.getElementById('m-rep').value.trim(),
    mnt_status: document.getElementById('m-status').value,
    notes: document.getElementById('m-notes').value.trim(),
    po_number: document.getElementById('m-po-number').value.trim(),
    invoice_number: document.getElementById('m-invoice-number').value.trim(),
  };
  const pf = document.getElementById('m-pdf').files[0];
  const pof = document.getElementById('m-po-pdf').files[0];
  if (pf && !checkPdfSize(pf)) { alert('Max 5MB'); return; }
  if (pof && !checkPdfSize(pof)) { alert('Max 5MB'); return; }

  const editId = state.editId;
  const existing = editId ? state.records.find(r => r.id === editId) : null;

  saveBtn.disabled = true;
  try {
    const id = editId || crypto.randomUUID();
    if (pf) Object.assign(d, await uploadPdf(id, pf));
    if (pof) Object.assign(d, await uploadPdf(id, pof, 'po'));
    if (editId) {
      await updateMntRecord(editId, d);
      if (pf && existing && existing.pdf_path && existing.pdf_path !== d.pdf_path) {
        await removePdf(existing.pdf_path);
      }
      if (pof && existing && existing.po_pdf_path && existing.po_pdf_path !== d.po_pdf_path) {
        await removePdf(existing.po_pdf_path);
      }
    } else {
      await insertMntRecord(d);
    }
    closeAddModal();
  } catch (e) {
    alert('Save failed: ' + e.message);
  } finally {
    saveBtn.disabled = false;
  }
}

export async function updStatus(id, val) {
  try { await updateMntRecord(id, { mnt_status: val }); }
  catch (e) { alert('Update failed: ' + e.message); renderTable(); }
}

export async function updNotes(id, val) {
  try { await updateMntRecord(id, { notes: val }); }
  catch (e) { alert('Update failed: ' + e.message); }
}

export async function attPdf(id) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.pdf';
  inp.onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!checkPdfSize(f)) { alert('Max 5MB'); return; }
    const r = state.records.find(x => x.id === id);
    try {
      const up = await uploadPdf(id, f);
      await updateMntRecord(id, up);
      if (r && r.pdf_path && r.pdf_path !== up.pdf_path) await removePdf(r.pdf_path);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  };
  inp.click();
}

export function viewPdf(id) {
  const r = state.records.find(x => x.id === id);
  if (r && r.pdf_path) openPdf(r.pdf_path);
}

export async function attPoPdf(id) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.pdf';
  inp.onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!checkPdfSize(f)) { alert('Max 5MB'); return; }
    const r = state.records.find(x => x.id === id);
    try {
      const up = await uploadPdf(id, f, 'po');
      await updateMntRecord(id, up);
      if (r && r.po_pdf_path && r.po_pdf_path !== up.po_pdf_path) await removePdf(r.po_pdf_path);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  };
  inp.click();
}

export function viewPoPdf(id) {
  const r = state.records.find(x => x.id === id);
  if (r && r.po_pdf_path) openPdf(r.po_pdf_path);
}

/* ====== FTTB MODAL ====== */
export function openFttbAdd() {
  state.editFttbId = null;
  document.getElementById('fm-title').textContent = 'Add FTTB Record';
  ['fm-frgref', 'fm-link', 'fm-cust', 'fm-job', 'fm-ticket', 'fm-notes'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('fm-stage').value = 'Survey';
  document.getElementById('fm-status').value = '';
  document.getElementById('fm-amt').value = '';
  document.getElementById('fttb-ov').classList.add('open');
}

export function openFttbEdit(id) {
  const r = state.fttbRecords.find(x => x.id === id);
  if (!r) return;
  state.editFttbId = id;
  document.getElementById('fm-title').textContent = 'Edit FTTB';
  document.getElementById('fm-frgref').value = r.frg_ref || '';
  document.getElementById('fm-link').value = r.link_status || '';
  document.getElementById('fm-cust').value = r.customer || '';
  document.getElementById('fm-job').value = r.job_type || '';
  document.getElementById('fm-ticket').value = r.ticket || '';
  document.getElementById('fm-stage').value = r.stage || 'Survey';
  document.getElementById('fm-status').value = r.fttb_status || '';
  document.getElementById('fm-amt').value = r.amount || '';
  document.getElementById('fm-notes').value = r.notes || '';
  document.getElementById('fttb-ov').classList.add('open');
}

export function closeFttbModal() {
  document.getElementById('fttb-ov').classList.remove('open');
}

export async function saveFttbModal() {
  const saveBtn = document.getElementById('fm-save-btn');
  const d = {
    frg_ref: document.getElementById('fm-frgref').value.trim(),
    link_status: document.getElementById('fm-link').value.trim(),
    customer: document.getElementById('fm-cust').value.trim(),
    job_type: document.getElementById('fm-job').value.trim(),
    ticket: document.getElementById('fm-ticket').value.trim(),
    stage: document.getElementById('fm-stage').value,
    fttb_status: document.getElementById('fm-status').value,
    amount: parseFloat(document.getElementById('fm-amt').value) || 0,
    notes: document.getElementById('fm-notes').value.trim(),
  };
  const editFttbId = state.editFttbId;
  saveBtn.disabled = true;
  try {
    if (editFttbId) await updateFttbRecord(editFttbId, d);
    else await insertFttbRecord(d);
    closeFttbModal();
  } catch (e) {
    alert('Save failed: ' + e.message);
  } finally {
    saveBtn.disabled = false;
  }
}

export async function updFttbSt(id, val) {
  try { await updateFttbRecord(id, { fttb_status: val }); }
  catch (e) { alert('Update failed: ' + e.message); renderFttb(); }
}

export async function updFttbNotes(id, val) {
  try { await updateFttbRecord(id, { notes: val }); }
  catch (e) { alert('Update failed: ' + e.message); }
}
