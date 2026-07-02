// In-memory mirror of the mnt_records / fttb_records tables.
// Populated by data.js on load, patched row-by-row by realtime.js.
export const state = {
  records: [],
  fttbRecords: [],
  sortCol: 'date',
  sortAsc: true,
  editId: null,
  editFttbId: null,
  impRows: [],
  fttbImpRows: [],
};
