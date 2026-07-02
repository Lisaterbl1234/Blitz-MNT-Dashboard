-- Blitz MNT/FTTB Dashboard — Supabase schema
-- Paste this whole file into the Supabase Dashboard SQL Editor (Project -> SQL Editor -> New query) and run once.
-- No CLI / npm required.

-- ============================================================
-- 1. TABLES
-- ============================================================

create table if not exists mnt_records (
  id uuid primary key default gen_random_uuid(),
  date date,
  expiry date,
  doc_no text,
  ref text,
  amount numeric(12,2) not null default 0,
  rep text,
  mnt_status text not null default 'outstanding'
    check (mnt_status in ('outstanding','tobeinvoiced','invoice','quotes','cancelled')),
  notes text not null default '',
  pdf_path text,
  pdf_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_by_email text,
  updated_by_email text
);

create table if not exists fttb_records (
  id uuid primary key default gen_random_uuid(),
  frg_ref text,
  link_status text,
  customer text,
  job_type text,
  ticket text,
  stage text
    check (stage in ('Survey','Scheduling','Build','Job Report Approvals','FF Approved')),
  fttb_status text not null default ''
    check (fttb_status in ('','toinvoice','invoiced','pending')),
  amount numeric(12,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_by_email text,
  updated_by_email text
);

create index if not exists mnt_records_doc_no_idx on mnt_records (doc_no);
create index if not exists fttb_records_ticket_idx on fttb_records (ticket);

-- ============================================================
-- 2. AUDIT TRIGGER — server-side, client can't spoof these fields
-- ============================================================

create or replace function set_audit_fields()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_email := auth.jwt()->>'email';
  else
    -- never allow created_* to be overwritten on UPDATE
    new.created_by := old.created_by;
    new.created_by_email := old.created_by_email;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_email := auth.jwt()->>'email';
  return new;
end;
$$;

drop trigger if exists mnt_records_audit on mnt_records;
create trigger mnt_records_audit
  before insert or update on mnt_records
  for each row execute function set_audit_fields();

drop trigger if exists fttb_records_audit on fttb_records;
create trigger fttb_records_audit
  before insert or update on fttb_records
  for each row execute function set_audit_fields();

-- ============================================================
-- 3. ROW LEVEL SECURITY — gate access to signed-in team members,
--    no fine-grained per-user permissions (shared-login model).
--    No policy for `anon` = anonymous requests get zero rows,
--    zero writes. This is what makes the anon key safe to commit.
-- ============================================================

alter table mnt_records enable row level security;
alter table fttb_records enable row level security;

drop policy if exists "authenticated_all" on mnt_records;
create policy "authenticated_all" on mnt_records
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on fttb_records;
create policy "authenticated_all" on fttb_records
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 4. REALTIME — enable row-level change broadcasts for both tables
-- ============================================================

alter publication supabase_realtime add table mnt_records;
alter publication supabase_realtime add table fttb_records;

-- ============================================================
-- 5. STORAGE — private bucket for PDF attachments (MNT only)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "authenticated_read_attachments" on storage.objects;
create policy "authenticated_read_attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments');

drop policy if exists "authenticated_write_attachments" on storage.objects;
create policy "authenticated_write_attachments" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments');

drop policy if exists "authenticated_update_attachments" on storage.objects;
create policy "authenticated_update_attachments" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments');

drop policy if exists "authenticated_delete_attachments" on storage.objects;
create policy "authenticated_delete_attachments" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments');
