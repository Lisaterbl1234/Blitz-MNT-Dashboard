import { state } from './state.js';
import { esc, fa, toIsoDate } from './helpers.js';
import { bulkInsertMntRecords, updateMntRecord, bulkInsertFttbRecords, updateFttbRecord } from './data.js';

const MNT_AL = {
  date: ['date', 'quote date', 'po date'],
  expiry: ['expiry', 'expiry date', 'expires'],
  doc_no: ['doc no', 'doc no.', 'document no', 'quote no', 'po no', 'docno'],
  ref: ['ref', 'reference', 'customer ref', 'cust ref'],
  amount: ['amount', 'value', 'price', 'total', 'amt'],
  rep: ['rep', 'sales rep', 'salesperson', 'agent'],
  mnt_status: ['status', 'state'],
  notes: ['notes', 'note', 'comment', 'remarks'],
};
const FTTB_AL = {
  frg_ref: ['frg ref', 'frg reference', 'frgref', 'frg', 'ref'],
  link_status: ['link status', 'link', 'connection'],
  customer: ['customer', 'client', 'company', 'name'],
  job_type: ['job type', 'jobtype', 'type', 'job'],
  ticket: ['ticket', 'ticket no', 'ticket number'],
  stage: ['stage', 'step', 'phase'],
  notes: ['notes', 'note', 'comment'],
  fttb_status: ['status', 'invoice status'],
  amount: ['amount', 'value', 'price', 'total'],
};

const DATE_FIELDS = new Set(['date', 'expiry']);

export function openImport() {
  document.getElementById('imp-ov').classList.add('open');
  document.getElementById('imp-file').value = '';
  document.getElementById('imp-prev').innerHTML = '';
  document.getElementById('imp-ok').style.display = 'none';
  state.impRows = [];
}
export function closeImport() { document.getElementById('imp-ov').classList.remove('open'); }
export function openFttbImport() {
  document.getElementById('fttb-imp-ov').classList.add('open');
  document.getElementById('fttb-imp-file').value = '';
  document.getElementById('fttb-imp-prev').innerHTML = '';
  document.getElementById('fttb-imp-ok').style.display = 'none';
  state.fttbImpRows = [];
}
export function closeFttbImport() { document.getElementById('fttb-imp-ov').classList.remove('open'); }

export function handleImport(inputEl, type) {
  const f = inputEl.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) { alert('File empty'); return; }
      const hdrs = rows[0].map(h => String(h).toLowerCase().trim());
      const al = type === 'mnt' ? MNT_AL : FTTB_AL;
      const cm = {};
      Object.keys(al).forEach((field) => {
        al[field].forEach((n) => {
          if (cm[field] === undefined) { const i = hdrs.indexOf(n); if (i >= 0) cm[field] = i; }
        });
      });
      const parsed = rows.slice(1).filter(r => r.some(c => c !== '')).map((r) => {
        const obj = {};
        Object.keys(cm).forEach((field) => {
          let val = String(r[cm[field]] || '').trim();
          if (DATE_FIELDS.has(field)) val = toIsoDate(val) || null;
          obj[field] = val;
        });
        if (type === 'mnt') { obj.mnt_status = obj.mnt_status || 'outstanding'; obj.notes = obj.notes || ''; }
        else { obj.fttb_status = obj.fttb_status || ''; obj.notes = obj.notes || ''; }
        return obj;
      });
      if (type === 'mnt') state.impRows = parsed; else state.fttbImpRows = parsed;
      const keys = Object.keys(cm).slice(0, 5);
      const pid = type === 'mnt' ? 'imp-prev' : 'fttb-imp-prev';
      document.getElementById(pid).innerHTML =
        `<p style="font-size:.78rem;color:#666;margin-bottom:5px">Found ${parsed.length} rows. Preview (first 5):</p>` +
        `<table style="width:100%;font-size:.76rem"><thead><tr>${keys.map(k => `<th style="text-align:left;padding:3px">${k}</th>`).join('')}</tr></thead><tbody>` +
        parsed.slice(0, 5).map(r => `<tr>${keys.map(k => `<td style="padding:3px">${esc(r[k] || '')}</td>`).join('')}</tr>`).join('') +
        '</tbody></table>';
      document.getElementById(type === 'mnt' ? 'imp-ok' : 'fttb-imp-ok').style.display = '';
    } catch (err) {
      alert('Error reading file: ' + err.message);
    }
  };
  rd.readAsArrayBuffer(f);
}

export async function doImport(type) {
  try {
    if (type === 'mnt') {
      const byDoc = new Map(state.records.filter(r => r.doc_no).map(r => [r.doc_no, r]));
      const toInsert = [];
      const toUpdate = [];
      state.impRows.forEach((r) => {
        if (r.doc_no && byDoc.has(r.doc_no)) toUpdate.push({ id: byDoc.get(r.doc_no).id, patch: r });
        else toInsert.push(r);
      });
      if (toInsert.length) await bulkInsertMntRecords(toInsert);
      await Promise.all(toUpdate.map(u => updateMntRecord(u.id, u.patch)));
      closeImport();
      alert(`Import done: ${toInsert.length} added, ${toUpdate.length} updated.`);
    } else {
      const byTicket = new Map(state.fttbRecords.filter(r => r.ticket).map(r => [r.ticket, r]));
      const toInsert = [];
      const toUpdate = [];
      state.fttbImpRows.forEach((r) => {
        if (r.ticket && byTicket.has(r.ticket)) toUpdate.push({ id: byTicket.get(r.ticket).id, patch: r });
        else toInsert.push(r);
      });
      if (toInsert.length) await bulkInsertFttbRecords(toInsert);
      await Promise.all(toUpdate.map(u => updateFttbRecord(u.id, u.patch)));
      closeFttbImport();
      alert(`Import done: ${toInsert.length} added, ${toUpdate.length} updated.`);
    }
  } catch (e) {
    alert('Import failed: ' + e.message);
  }
}

/* ====== HOD REPORT ====== */
function es(r) { return r.mnt_status || 'outstanding'; }

export function openHod() {
  const reps = state.records.map(r => r.rep).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).sort();
  const grand = state.records.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const amtS = (recs, s) => recs.filter(r => es(r) === s).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const rows = reps.map((rep) => {
    const recs = state.records.filter(r => r.rep === rep);
    const tot = recs.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    return '<tr style="border-bottom:1px solid #f0edf8">' +
      `<td style="padding:7px 11px">${esc(rep)}</td>` +
      `<td style="padding:7px 11px;text-align:right">${fa(tot)}</td>` +
      `<td style="padding:7px 11px;text-align:right">${fa(amtS(recs, 'outstanding'))}</td>` +
      `<td style="padding:7px 11px;text-align:right">${fa(amtS(recs, 'tobeinvoiced'))}</td>` +
      `<td style="padding:7px 11px;text-align:right">${fa(amtS(recs, 'invoice'))}</td>` +
      `<td style="padding:7px 11px;text-align:right">${recs.length}</td>` +
      '</tr>';
  });
  document.getElementById('hod-content').innerHTML =
    `<p style="font-size:.8rem;color:#888;margin-bottom:12px">Grand Total: <strong>${fa(grand)}</strong> across <strong>${state.records.length}</strong> records</p>` +
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.83rem">' +
    '<thead><tr style="background:#f0edf8">' +
    '<th style="padding:7px 11px;text-align:left">Sales Rep</th>' +
    '<th style="padding:7px 11px;text-align:right">Total</th>' +
    '<th style="padding:7px 11px;text-align:right">PO Outstanding</th>' +
    '<th style="padding:7px 11px;text-align:right">To Be Invoiced</th>' +
    '<th style="padding:7px 11px;text-align:right">Invoiced</th>' +
    '<th style="padding:7px 11px;text-align:right">Count</th>' +
    `</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  document.getElementById('hod-ov').classList.add('open');
}
export function closeHod() { document.getElementById('hod-ov').classList.remove('open'); }

export function downloadHodExcel() {
  const reps = state.records.map(r => r.rep).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).sort();
  const amtS = (recs, s) => recs.filter(r => es(r) === s).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const wsData = [['Sales Rep', 'Total (R)', 'PO Outstanding (R)', 'To Be Invoiced (R)', 'Invoiced (R)', 'Count']];
  let grandTot = 0, grandOut = 0, grandTbi = 0, grandInv = 0, grandCnt = 0;
  reps.forEach((rep) => {
    const recs = state.records.filter(r => r.rep === rep);
    const tot = recs.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    const out = amtS(recs, 'outstanding'), tbi = amtS(recs, 'tobeinvoiced'), inv = amtS(recs, 'invoice');
    wsData.push([rep, tot, out, tbi, inv, recs.length]);
    grandTot += tot; grandOut += out; grandTbi += tbi; grandInv += inv; grandCnt += recs.length;
  });
  wsData.push(['TOTAL', grandTot, grandOut, grandTbi, grandInv, grandCnt]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'HOD Report');
  const date = new Date().toLocaleDateString('en-ZA').replace(/\//g, '-');
  XLSX.writeFile(wb, `HOD_Report_${date}.xlsx`);
}
