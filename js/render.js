import { state } from './state.js';
import { pd, fd, fa, esc } from './helpers.js';

/* ====== SHARED ====== */
function es(r) { return r.mnt_status || 'outstanding'; }

/* ====== SORT / FILTER (MNT) ====== */
export function sortBy(col) {
  if (state.sortCol === col) state.sortAsc = !state.sortAsc;
  else { state.sortCol = col; state.sortAsc = true; }
  renderTable();
}

const SORT_FIELD = { date: 'date', expiry: 'expiry', docNo: 'doc_no', amount: 'amount', rep: 'rep' };

function getSorted() {
  const field = SORT_FIELD[state.sortCol] || state.sortCol;
  return state.records.slice().sort((a, b) => {
    let va = a[field], vb = b[field];
    if (field === 'date' || field === 'expiry') { va = pd(va) || new Date(0); vb = pd(vb) || new Date(0); }
    else if (field === 'amount') { va = Number(va) || 0; vb = Number(vb) || 0; }
    else { va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase(); }
    return (va < vb ? -1 : va > vb ? 1 : 0) * (state.sortAsc ? 1 : -1);
  });
}

function getFiltered() {
  const q = (document.getElementById('search').value || '').toLowerCase();
  const st = document.getElementById('fil-status').value;
  const rep = document.getElementById('fil-rep').value;
  const mo = document.getElementById('fil-month').value;
  const dtField = document.getElementById('fil-dt').value || 'date';
  const df = document.getElementById('d-from').value;
  const dto = document.getElementById('d-to').value;
  return getSorted().filter((r) => {
    if (st && es(r) !== st) return false;
    if (rep && r.rep !== rep) return false;
    const ds = r[dtField] || '';
    if (mo) { const d = pd(ds); if (!d || String(d.getMonth() + 1).padStart(2, '0') !== mo) return false; }
    if (df) { const d = pd(ds); if (!d || d < new Date(df)) return false; }
    if (dto) { const d = pd(ds); if (!d || d > new Date(dto + 'T23:59:59')) return false; }
    if (q) {
      const hay = [r.doc_no, r.ref, r.rep, r.notes, String(r.amount)].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
}

export function clearDates() {
  document.getElementById('d-from').value = '';
  document.getElementById('d-to').value = '';
  renderTable();
}

export function populateReps() {
  const s = document.getElementById('fil-rep');
  if (!s) return;
  const cur = s.value;
  const reps = state.records.map(r => r.rep).filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i).sort();
  s.innerHTML = '<option value="">All Reps</option>' +
    reps.map(r => `<option value="${esc(r)}"${r === cur ? ' selected' : ''}>${esc(r)}</option>`).join('');
}

/* ====== RENDER MNT ====== */
export function renderTable() {
  try { populateReps(); _renderTable(); }
  catch (e) {
    const tb = document.getElementById('tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="9" class="nores">Error: ${e.message}</td></tr>`;
  }
}

const STATUS_OPTS = [
  ['outstanding', 'PO Outstanding'], ['tobeinvoiced', 'To Be Invoiced'],
  ['invoice', 'Invoiced'], ['quotes', 'Quote'], ['cancelled', 'Cancelled'],
];

function _renderTable() {
  const rows = getFiltered();
  const isFiltered = rows.length !== state.records.length;
  document.getElementById('rcnt').textContent = `Showing ${rows.length} of ${state.records.length} records`;
  updateStats(rows, isFiltered);
  const tb = document.getElementById('tbody');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="9" class="nores">No matching records.</td></tr>'; return; }
  tb.innerHTML = rows.map((r) => {
    const v = es(r);
    const sel = `<select class="ssel" data-id="${r.id}" data-action="status">` +
      STATUS_OPTS.map(([val, label]) => `<option value="${val}"${v === val ? ' selected' : ''}>${label}</option>`).join('') +
      '</select>';
    const pb = r.pdf_name
      ? `<button class="pbtn" data-id="${r.id}" data-action="view-pdf" title="View PDF">📄</button>`
      : `<button class="pbtn" data-id="${r.id}" data-action="attach-pdf" title="Attach PDF">📐</button>`;
    return '<tr>' +
      `<td>${fd(r.date)}</td>` +
      `<td>${fd(r.expiry)}</td>` +
      `<td style="font-weight:600;white-space:nowrap">${esc(r.doc_no || '')}</td>` +
      `<td style="max-width:250px">${esc(r.ref || '')}</td>` +
      `<td style="white-space:nowrap">${fa(r.amount)}</td>` +
      `<td>${esc(r.rep || '')}</td>` +
      `<td>${sel}</td>` +
      `<td><input class="ninp" data-id="${r.id}" data-action="notes" value="${esc(r.notes || '')}" placeholder="Add note..."></td>` +
      `<td><button class="ebtn" data-id="${r.id}" data-action="edit">✏️</button>${pb}</td>` +
      '</tr>';
  }).join('');
}

function updateStats(rows, isFiltered) {
  const all = rows || state.records;
  const lbl = isFiltered ? ' <span style="font-size:.65rem;background:#e8e0f8;color:#6e8ab5;padding:1px 6px;border-radius:9px;vertical-align:middle">filtered</span>' : '';
  const cnt = (s) => all.filter(r => es(r) === s).length;
  const amt = (s) => all.filter(r => es(r) === s).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const tot = all.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const sub = isFiltered ? `of ${state.records.length} total` : `${all.length} records`;
  document.getElementById('stats-row').innerHTML =
    `<div class="sc total"><div class="slbl">Total POs${lbl}</div><div class="sval">${all.length}</div><div class="ssub">${sub}</div></div>` +
    `<div class="sc total"><div class="slbl">Total Quote Value${lbl}</div><div class="sval">${fa(tot)}</div><div class="ssub">${sub}</div></div>` +
    `<div class="sc outstanding"><div class="slbl">PO Outstanding</div><div class="sval">${cnt('outstanding')}</div><div class="ssub">${fa(amt('outstanding'))}</div></div>` +
    `<div class="sc tbi"><div class="slbl">To Be Invoiced</div><div class="sval">${cnt('tobeinvoiced')}</div><div class="ssub">${fa(amt('tobeinvoiced'))}</div></div>` +
    `<div class="sc invoiced"><div class="slbl">Invoiced</div><div class="sval">${cnt('invoice')}</div><div class="ssub">${fa(amt('invoice'))}</div></div>` +
    `<div class="sc quotes"><div class="slbl">Quotes</div><div class="sval">${cnt('quotes')}</div><div class="ssub">${fa(amt('quotes'))}</div></div>` +
    `<div class="sc cancelled"><div class="slbl">Cancelled</div><div class="sval">${cnt('cancelled')}</div><div class="ssub">${fa(amt('cancelled'))}</div></div>`;
}

/* ====== RENDER FTTB ====== */
export function renderFttb() {
  try { _renderFttb(); }
  catch (e) {
    const tb = document.getElementById('fttb-tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="9" class="nores">Error: ${e.message}</td></tr>`;
  }
}

function _renderFttb() {
  const q = (document.getElementById('fttb-srch').value || '').toLowerCase();
  const st = document.getElementById('fttb-fil-stage').value;
  const iv = document.getElementById('fttb-fil-status').value;
  const rows = state.fttbRecords.filter((r) => {
    if (st && r.stage !== st) return false;
    if (iv && r.fttb_status !== iv) return false;
    if (q) {
      const hay = [r.frg_ref, r.link_status, r.customer, r.job_type, r.ticket, r.stage, r.notes].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
  const isFiltered = rows.length !== state.fttbRecords.length;
  document.getElementById('fttb-rcnt').textContent = `Showing ${rows.length} of ${state.fttbRecords.length} records`;
  updateFttbStats(rows, isFiltered);
  const tb = document.getElementById('fttb-tbody');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="9" class="nores">No records.</td></tr>'; return; }
  tb.innerHTML = rows.map((r) => {
    const isel = `<select class="ssel" data-id="${r.id}" data-action="fttb-status">` +
      `<option value="" ${!r.fttb_status ? 'selected' : ''}>&#8212;</option>` +
      `<option value="toinvoice" ${r.fttb_status === 'toinvoice' ? 'selected' : ''}>To Invoice</option>` +
      `<option value="invoiced" ${r.fttb_status === 'invoiced' ? 'selected' : ''}>Invoiced</option>` +
      `<option value="pending" ${r.fttb_status === 'pending' ? 'selected' : ''}>Pending</option>` +
      '</select>';
    return '<tr>' +
      `<td style="font-weight:600">${esc(r.frg_ref || '')}</td>` +
      `<td>${esc(r.link_status || '')}</td>` +
      `<td>${esc(r.customer || '')}</td>` +
      `<td>${esc(r.job_type || '')}</td>` +
      `<td>${esc(r.ticket || '')}</td>` +
      `<td>${esc(r.stage || '')}</td>` +
      `<td>${isel}</td>` +
      `<td>${fa(r.amount || 0)}</td>` +
      `<td><input class="ninp" data-id="${r.id}" data-action="fttb-notes" value="${esc(r.notes || '')}" placeholder="Add note...">` +
      `<button class="ebtn" data-id="${r.id}" data-action="fttb-edit">✏️</button></td>` +
      '</tr>';
  }).join('');
}

function updateFttbStats(rows, isFiltered) {
  const all = rows || state.fttbRecords;
  const lbl = isFiltered ? ' <span style="font-size:.65rem;background:#e8e0f8;color:#6e8ab5;padding:1px 6px;border-radius:9px;vertical-align:middle">filtered</span>' : '';
  const sub = isFiltered ? `of ${state.fttbRecords.length} total` : `${all.length} records`;
  const amtOf = (s) => all.filter(r => r.fttb_status === s).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const cntOf = (s) => all.filter(r => r.fttb_status === s).length;
  const tot = all.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  document.getElementById('fttb-stats').innerHTML =
    `<div class="sc total"><div class="slbl">Total FTTB${lbl}</div><div class="sval">${all.length}</div><div class="ssub">${fa(tot)}&nbsp;&bull;&nbsp;${sub}</div></div>` +
    `<div class="sc invoiced"><div class="slbl">Invoiced</div><div class="sval">${cntOf('invoiced')}</div><div class="ssub">${fa(amtOf('invoiced'))}</div></div>` +
    `<div class="sc tbi"><div class="slbl">To Invoice</div><div class="sval">${cntOf('toinvoice')}</div><div class="ssub">${fa(amtOf('toinvoice'))}</div></div>` +
    `<div class="sc outstanding"><div class="slbl">Pending</div><div class="sval">${cntOf('pending')}</div><div class="ssub">${fa(amtOf('pending'))}</div></div>`;
}
