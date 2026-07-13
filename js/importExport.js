import { state } from './state.js';
import { esc, pd, toIsoDate } from './helpers.js';
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
  frg_ref: ['frg ref', 'frg reference', 'frgref', 'frg', 'ref', 'link label'],
  link_status: ['link status', 'link', 'connection'],
  customer: ['customer', 'client', 'company', 'name', 'link site'],
  job_type: ['job type', 'jobtype', 'type', 'job', 'sow type'],
  ticket: ['ticket', 'ticket no', 'ticket number'],
  stage: ['stage', 'phase', 'ticket step'],
  notes: ['notes', 'note', 'comment', 'comments', 'general comments & feedback', 'general comments and feedback', 'feedback'],
  fttb_status: ['status', 'invoice status'],
  amount: ['amount', 'value', 'price', 'total'],
};

const DATE_FIELDS = new Set(['date', 'expiry']);

// Spreadsheets tend to use human-readable status text (e.g. "Quote",
// "PO Outstanding") rather than the internal codes the app filters/dropdowns
// use ('quotes', 'outstanding', ...). Without normalizing on import, those
// rows fail to match any dropdown option and silently default to the first
// one, and status filters like "Quotes" never find them.
const MNT_STATUS_ALIASES = {
  outstanding: 'outstanding', 'po outstanding': 'outstanding', pending: 'outstanding',
  tobeinvoiced: 'tobeinvoiced', 'to be invoiced': 'tobeinvoiced', 'to invoice': 'tobeinvoiced',
  invoice: 'invoice', invoiced: 'invoice',
  quotes: 'quotes', quote: 'quotes', quoted: 'quotes',
  cancelled: 'cancelled', canceled: 'cancelled',
};
function normalizeMntStatus(raw) {
  const key = String(raw || '').toLowerCase().trim();
  return MNT_STATUS_ALIASES[key] || '';
}

// Real-world exports often have title/report-metadata rows above the actual
// header row (e.g. "FTTB Jobs Exporter Data as of: ..."). Scan the first few
// rows and pick whichever one matches the most known column aliases, rather
// than assuming the header is always row 1.
function findHeaderRowIndex(rows, al) {
  const allAliases = new Set();
  Object.values(al).forEach(list => list.forEach(a => allAliases.add(a)));
  let bestIdx = 0;
  let bestScore = -1;
  const scanLimit = Math.min(rows.length, 20);
  for (let i = 0; i < scanLimit; i++) {
    const hdrs = rows[i].map(h => String(h).toLowerCase().trim());
    const score = hdrs.filter(h => allAliases.has(h)).length;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestScore > 0 ? bestIdx : 0;
}

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
      const al = type === 'mnt' ? MNT_AL : FTTB_AL;
      const headerIdx = findHeaderRowIndex(rows, al);
      const hdrs = rows[headerIdx].map(h => String(h).toLowerCase().trim());
      const cm = {};
      Object.keys(al).forEach((field) => {
        al[field].forEach((n) => {
          if (cm[field] === undefined) { const i = hdrs.indexOf(n); if (i >= 0) cm[field] = i; }
        });
      });
      const parsed = rows.slice(headerIdx + 1).filter(r => r.some(c => c !== '')).map((r) => {
        const obj = {};
        Object.keys(cm).forEach((field) => {
          let val = String(r[cm[field]] || '').trim();
          if (DATE_FIELDS.has(field)) val = toIsoDate(val) || null;
          else if (field === 'mnt_status') val = normalizeMntStatus(val);
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

/* ====== HOD REPORT — Maintenance ticket allocations per region ====== */

// Each rep name already encodes the region they cover.
const REP_REGION = {
  'magda central': 'Central',
  'magda gauteng': 'Gauteng',
  'magda pe': 'Eastern Cape',
};
const REGIONS = ['Central', 'Eastern Cape', 'Gauteng'];
const REGION_COLORS = { Central: '#2a78d6', 'Eastern Cape': '#1baf7a', Gauteng: '#eda100' };

function regionOf(r) { return REP_REGION[String(r.rep || '').toLowerCase().trim()] || null; }

function regionCountsForMonth(monthStr) {
  const counts = {};
  REGIONS.forEach((r) => { counts[r] = 0; });
  if (!monthStr) return counts;
  state.records.forEach((r) => {
    const d = pd(r.date);
    if (!d) return;
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (ym !== monthStr) return;
    const reg = regionOf(r);
    if (reg) counts[reg]++;
  });
  return counts;
}

function monthLabel(monthStr) {
  if (!monthStr) return 'Select a month';
  const [y, m] = monthStr.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }).toUpperCase();
}

function renderRegionPanel(monthStr) {
  const counts = regionCountsForMonth(monthStr);
  const max = Math.max(1, ...REGIONS.map((r) => counts[r]));
  const total = REGIONS.reduce((a, r) => a + counts[r], 0);
  const bars = REGIONS.map((r) => {
    const pct = Math.round((counts[r] / max) * 100);
    return `<div class="hod-bar-col">` +
      `<div class="hod-bar-val">${counts[r]}</div>` +
      `<div class="hod-bar" style="height:${pct}%;background:${REGION_COLORS[r]}"></div>` +
      `<div class="hod-bar-label">${esc(r)}</div>` +
      '</div>';
  }).join('');
  return `<div class="hod-region-panel">` +
    `<div class="hod-region-title">${esc(monthLabel(monthStr))} TICKET ALLOCATIONS</div>` +
    `<div class="hod-bars">${bars}</div>` +
    `<div class="hod-total">TOTAL TICKETS: <strong>${total}</strong></div>` +
    '</div>';
}

export function renderHodReport() {
  const a = document.getElementById('hod-month-a').value;
  const b = document.getElementById('hod-month-b').value;
  const legend = `<div class="hod-legend">${REGIONS.map((r) =>
    `<span class="hod-legend-item"><span class="hod-legend-swatch" style="background:${REGION_COLORS[r]}"></span>${esc(r)}</span>`
  ).join('')}</div>`;
  document.getElementById('hod-content').innerHTML =
    legend + `<div class="hod-panels">${renderRegionPanel(a)}${renderRegionPanel(b)}</div>`;
}

export function openHod() {
  const now = new Date();
  const ma = document.getElementById('hod-month-a');
  const mb = document.getElementById('hod-month-b');
  if (!ma.value) {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    ma.value = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  }
  if (!mb.value) mb.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  renderHodReport();
  document.getElementById('hod-ov').classList.add('open');
}
export function closeHod() { document.getElementById('hod-ov').classList.remove('open'); }

export function downloadHodExcel() {
  const a = document.getElementById('hod-month-a').value;
  const b = document.getElementById('hod-month-b').value;
  const countsA = regionCountsForMonth(a);
  const countsB = regionCountsForMonth(b);
  const wsData = [['Region', monthLabel(a), monthLabel(b)]];
  REGIONS.forEach((r) => wsData.push([r, countsA[r], countsB[r]]));
  wsData.push([
    'TOTAL',
    REGIONS.reduce((s, r) => s + countsA[r], 0),
    REGIONS.reduce((s, r) => s + countsB[r], 0),
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Maintenance Report');
  const date = new Date().toLocaleDateString('en-ZA').replace(/\//g, '-');
  XLSX.writeFile(wb, `Maintenance_Report_${date}.xlsx`);
}
