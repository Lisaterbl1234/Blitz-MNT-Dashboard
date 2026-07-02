import { supabase } from './supabaseClient.js';
import { state } from './state.js';
import { renderTable, renderFttb } from './render.js';
import { flashSaved, setSyncBadge } from './helpers.js';

let mntChannel = null;
let fttbChannel = null;

function patchArray(arr, eventType, newRow, oldRow) {
  if (eventType === 'INSERT') {
    if (!arr.some(r => r.id === newRow.id)) arr.unshift(newRow);
  } else if (eventType === 'UPDATE') {
    const i = arr.findIndex(r => r.id === newRow.id);
    if (i >= 0) arr[i] = newRow; else arr.unshift(newRow);
  } else if (eventType === 'DELETE') {
    const i = arr.findIndex(r => r.id === oldRow.id);
    if (i >= 0) arr.splice(i, 1);
  }
}

function handleStatus(status) {
  if (status === 'SUBSCRIBED') setSyncBadge('connected');
  else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncBadge('error');
  else if (status === 'CLOSED') setSyncBadge('');
}

export function initRealtime() {
  setSyncBadge('syncing');

  mntChannel = supabase.channel('mnt-records-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mnt_records' }, (payload) => {
      patchArray(state.records, payload.eventType, payload.new, payload.old);
      renderTable();
      flashSaved('🔄 Updated from colleague');
    })
    .subscribe(handleStatus);

  fttbChannel = supabase.channel('fttb-records-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fttb_records' }, (payload) => {
      patchArray(state.fttbRecords, payload.eventType, payload.new, payload.old);
      renderFttb();
      flashSaved('🔄 Updated from colleague');
    })
    .subscribe(handleStatus);
}

export function teardownRealtime() {
  if (mntChannel) { supabase.removeChannel(mntChannel); mntChannel = null; }
  if (fttbChannel) { supabase.removeChannel(fttbChannel); fttbChannel = null; }
  setSyncBadge('');
}
