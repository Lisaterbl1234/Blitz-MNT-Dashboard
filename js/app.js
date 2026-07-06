import { initAuth } from './auth.js';
import { state } from './state.js';
import { fetchMntRecords, fetchFttbRecords } from './data.js';
import { renderTable, renderFttb, sortBy, clearDates } from './render.js';
import { initRealtime, teardownRealtime } from './realtime.js';
import {
  openAddModal, openEdit, closeAddModal, saveModal, updStatus, updNotes, attPdf, viewPdf,
  attPoPdf, viewPoPdf, autoFillFromPdf,
  openFttbAdd, openFttbEdit, closeFttbModal, saveFttbModal, updFttbSt, updFttbNotes,
} from './modal.js';
import {
  openImport, closeImport, openFttbImport, closeFttbImport, handleImport, doImport,
  openHod, closeHod, downloadHodExcel,
} from './importExport.js';

function switchTab(t) {
  document.getElementById('mnt-sec').style.display = t === 'mnt' ? '' : 'none';
  document.getElementById('fttb-sec').style.display = t === 'fttb' ? '' : 'none';
  document.getElementById('tab-mnt').classList.toggle('active', t === 'mnt');
  document.getElementById('tab-fttb').classList.toggle('active', t === 'fttb');
  if (t === 'fttb') renderFttb();
}

async function initApp() {
  try {
    const [mnt, fttb] = await Promise.all([fetchMntRecords(), fetchFttbRecords()]);
    state.records = mnt;
    state.fttbRecords = fttb;
    renderTable();
    renderFttb();
    initRealtime();
  } catch (e) {
    showError('Failed to load data: ' + e.message);
  }
}

function teardownApp() {
  teardownRealtime();
  state.records = [];
  state.fttbRecords = [];
}

function showError(msg) {
  const b = document.getElementById('err-banner');
  if (b) { b.textContent = msg + ' — press F5 to recover.'; b.style.display = 'block'; }
}

window.onerror = function (msg, src, line, col, err) {
  showError('JS Error: ' + (err ? err.message : msg) + ' (L' + line + ')');
  return false;
};

function wireEvents() {
  document.getElementById('tab-mnt').addEventListener('click', () => switchTab('mnt'));
  document.getElementById('tab-fttb').addEventListener('click', () => switchTab('fttb'));

  // MNT toolbar
  document.getElementById('search').addEventListener('input', renderTable);
  ['fil-status', 'fil-rep', 'fil-month', 'd-from', 'd-to'].forEach(id =>
    document.getElementById(id).addEventListener('change', renderTable));
  document.getElementById('clear-dates-btn').addEventListener('click', clearDates);
  document.getElementById('add-mnt-btn').addEventListener('click', openAddModal);
  document.getElementById('import-mnt-btn').addEventListener('click', openImport);
  document.getElementById('hod-btn').addEventListener('click', openHod);

  // MNT sortable headers
  document.querySelector('#mnt-sec thead').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) sortBy(th.dataset.sort);
  });

  // MNT table row actions (event delegation — rows are re-rendered constantly)
  const tbody = document.getElementById('tbody');
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') openEdit(id);
    else if (btn.dataset.action === 'view-pdf') viewPdf(id);
    else if (btn.dataset.action === 'attach-pdf') attPdf(id);
    else if (btn.dataset.action === 'view-po-pdf') viewPoPdf(id);
    else if (btn.dataset.action === 'attach-po-pdf') attPoPdf(id);
  });
  tbody.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.action === 'status') updStatus(el.dataset.id, el.value);
    else if (el.dataset.action === 'notes') updNotes(el.dataset.id, el.value);
  });

  // MNT add/edit modal
  document.getElementById('m-cancel-btn').addEventListener('click', closeAddModal);
  document.getElementById('m-save-btn').addEventListener('click', saveModal);
  ['m-po-pdf', 'm-pdf'].forEach(id =>
    document.getElementById(id).addEventListener('change', (e) => autoFillFromPdf(e.target.files[0])));

  // FTTB toolbar
  document.getElementById('fttb-srch').addEventListener('input', renderFttb);
  ['fttb-fil-stage', 'fttb-fil-status'].forEach(id =>
    document.getElementById(id).addEventListener('change', renderFttb));
  document.getElementById('add-fttb-btn').addEventListener('click', openFttbAdd);
  document.getElementById('import-fttb-btn').addEventListener('click', openFttbImport);

  // FTTB table row actions
  const fttbTbody = document.getElementById('fttb-tbody');
  fttbTbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="fttb-edit"]');
    if (btn) openFttbEdit(btn.dataset.id);
  });
  fttbTbody.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.action === 'fttb-status') updFttbSt(el.dataset.id, el.value);
    else if (el.dataset.action === 'fttb-notes') updFttbNotes(el.dataset.id, el.value);
  });

  // FTTB add/edit modal
  document.getElementById('fm-cancel-btn').addEventListener('click', closeFttbModal);
  document.getElementById('fm-save-btn').addEventListener('click', saveFttbModal);

  // HOD report
  document.getElementById('hod-close-btn').addEventListener('click', closeHod);
  document.getElementById('hod-download-btn').addEventListener('click', downloadHodExcel);
  document.getElementById('hod-ov').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeHod(); });

  // Import MNT
  document.getElementById('imp-close-btn').addEventListener('click', closeImport);
  document.getElementById('imp-cancel-btn').addEventListener('click', closeImport);
  document.getElementById('imp-file').addEventListener('change', function () { handleImport(this, 'mnt'); });
  document.getElementById('imp-ok').addEventListener('click', () => doImport('mnt'));

  // Import FTTB
  document.getElementById('fttb-imp-close-btn').addEventListener('click', closeFttbImport);
  document.getElementById('fttb-imp-cancel-btn').addEventListener('click', closeFttbImport);
  document.getElementById('fttb-imp-file').addEventListener('change', function () { handleImport(this, 'fttb'); });
  document.getElementById('fttb-imp-ok').addEventListener('click', () => doImport('fttb'));

  // Click outside to close for simple overlay modals
  ['add-ov', 'fttb-ov', 'imp-ov', 'fttb-imp-ov'].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('click', (e) => { if (e.target === el) el.classList.remove('open'); });
  });
}

wireEvents();
initAuth({ onSignIn: initApp, onSignOut: teardownApp });
