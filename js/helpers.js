// Parses either an ISO 'yyyy-mm-dd' date (what Postgres/Supabase returns)
// or a dd/mm/yyyy string (what spreadsheet imports may hand us).
export function pd(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const p = s.split('/');
  if (p.length === 3) return new Date(p[2], p[1] - 1, p[0]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function fd(s) {
  if (!s) return '';
  const d = pd(s);
  return (!d || isNaN(d)) ? s : d.toLocaleDateString('en-ZA');
}

// yyyy-mm-dd for <input type="date"> and for writing back to Postgres `date` columns.
export function toIsoDate(s) {
  const d = pd(s);
  if (!d || isNaN(d)) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function fa(v) {
  return 'R ' + (Number(v) || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

let flashTimer = null;
export function flashSaved(m) {
  const el = document.getElementById('last-saved');
  if (!el) return;
  el.textContent = m;
  el.style.opacity = '1';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.style.opacity = '0.45'; }, 3500);
}

export function setSyncBadge(state) {
  const b = document.getElementById('sync-badge');
  if (!b) return;
  b.className = state;
  const txt = { connected: '🔥 Live', syncing: 'Syncing…', error: '⚠️ Offline' };
  document.getElementById('sync-text').textContent = txt[state] || state;
}
