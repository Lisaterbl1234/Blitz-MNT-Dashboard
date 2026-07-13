-- One-time cleanup: normalize mnt_status values that were written with
-- human-readable spreadsheet text (e.g. "Quote", "PO Outstanding") instead
-- of the internal codes the app's filters/dropdowns expect
-- (outstanding / tobeinvoiced / invoice / quotes / cancelled).
--
-- Run the SELECT first to see what's actually in the table before touching
-- any data:

select mnt_status, count(*) from mnt_records group by mnt_status order by 2 desc;

-- Once you've confirmed the stray values below, run the update. It only
-- touches rows whose mnt_status isn't already one of the five valid codes,
-- so re-running it is safe.

update mnt_records
set mnt_status = case lower(trim(mnt_status))
  when 'po outstanding' then 'outstanding'
  when 'pending'         then 'outstanding'
  when 'to be invoiced'  then 'tobeinvoiced'
  when 'to invoice'      then 'tobeinvoiced'
  when 'invoiced'        then 'invoice'
  when 'quote'           then 'quotes'
  when 'quoted'          then 'quotes'
  when 'canceled'        then 'cancelled'
  else mnt_status
end
where mnt_status not in ('outstanding', 'tobeinvoiced', 'invoice', 'quotes', 'cancelled');

-- Verify afterwards — every row should now be one of the 5 valid codes:
select mnt_status, count(*) from mnt_records group by mnt_status order by 2 desc;
