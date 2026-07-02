# Blitz MNT / FTTB Dashboard

Live, multi-user quote/PO and FTTB patching tracker. Plain HTML/CSS/JS (no build step, no npm) backed by
Supabase (Postgres + Auth + Storage + Realtime). Anyone can create an account and sign in to view and edit;
edits show up live for everyone else without full-page reloads.

**Access model note**: signup is open — anyone with the link can create an account (this was a deliberate
choice, not an oversight). Row Level Security only gates *unauthenticated* access; once someone has any
account, they have full read/write access to all quotes, POs, customer refs, amounts, and PDFs. There's no
per-user restriction layer. Worth revisiting if this ever holds data that shouldn't be that widely visible.

This is a from-scratch rebuild — it has **zero dependency on the old Firebase-based version**. The old file
keeps running independently on its own Firebase project until this app is fully validated; the two never
share a URL, database, or code.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → sign in → **New project**.
2. Pick an org, name it (e.g. `blitz-mnt-dashboard`), set a database password (save it — only needed for
   direct Postgres access, never used by the app itself), pick a region, create. Wait ~1-2 minutes for
   provisioning.

## 2. Run the schema

1. Dashboard → **SQL Editor** → New query.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) → Run.
   This creates `mnt_records` and `fttb_records`, enables Row Level Security, adds the audit trigger,
   enables Realtime replication, and creates the private `attachments` Storage bucket with its policies.
3. Confirm in **Table Editor** that both tables exist and show an "RLS enabled" badge.
4. (Optional, recommended) New query again → paste [`supabase/seed_mnt.sql`](supabase/seed_mnt.sql) → Run.
   This loads the ~74 historical MNT quote/PO rows.

## 3. Auth settings

**Authentication → Sign In / Providers → Supabase Auth**, under **User Signups**:

- **"Allow new users to sign up"** — **on**. This app uses open self-signup — anyone with the link can
  create their own account via the Sign Up link on the login screen.
- **"Confirm email"** — **on**. New users get a confirmation email after signing up and must click the
  link in it before they can sign in (the app shows "check your email to confirm your account" in this
  case). This is the safer default and is what's currently configured.
3. Optionally, **Authentication → Users → Add user** to pre-create specific accounts yourself.

## 4. Wire up the app

1. **Project Settings → API** → copy the **Project URL** and the **`anon` `public`** key.
   (Never copy the `service_role` key into any file in this project.)
2. Open [`js/supabaseClient.js`](js/supabaseClient.js) and replace `SUPABASE_URL` / `SUPABASE_ANON_KEY`
   with those two values. This key is safe to commit — Row Level Security (not key secrecy) is what
   actually gates access; an unauthenticated request gets zero rows and no writes.

## 5. Run it locally

This is static HTML/JS with ES modules, which most browsers block from `file://` due to CORS. Serve it
over a local HTTP server instead — any of these work, no npm required:

- VS Code "Live Server" extension → right-click `index.html` → "Open with Live Server".
- PowerShell one-liner: `python -m http.server 8080` *(only if Python happens to be installed)*.
- Any other static file server pointed at this folder.

Then open the printed `http://localhost:...` URL. You should land on the login screen — sign in with one
of the accounts created in step 3.

## 6. Deploy

Zero build step, so any static host works with an empty build command and this folder as the publish
directory: GitHub Pages, Netlify, Vercel, or Cloudflare Pages. GitHub Pages is the simplest if this repo
lives on GitHub — push, enable Pages on the branch, done.

## 7. Migrate data from the old app (optional, one-time)

See `tools/migrate.html` — open it locally (same local-server requirement as above), paste in
`JSON.stringify(records)` / `JSON.stringify(fttbRecords)` from the old app's devtools console, sign in,
and run. It bulk-inserts rows and uploads any embedded base64 PDFs to Storage in the same pass. Delete
`tools/migrate.html` once migration is verified — it's dev-only and never linked from the main app.

## Project structure

```
index.html          Shell: login screen, header, tabs, tables, all modals
css/styles.css       Ported styling (near-verbatim from the reference file)
js/
  supabaseClient.js  Supabase client init (fill in URL + anon key here)
  auth.js            Login/session gating, sign-out
  state.js           In-memory records/fttbRecords arrays
  data.js            All Supabase CRUD (insert/update/delete/fetch)
  realtime.js        Row-level postgres_changes subscriptions
  helpers.js         Date/currency formatting, escaping
  render.js          Table rendering, filtering, sorting, stat cards
  modal.js           Add/edit modal logic for both record types
  pdfUpload.js        PDF upload to Storage + signed-URL viewing
  importExport.js    Excel/CSV import, HOD report + Excel export
  app.js             Entry point — wires all the above together
supabase/
  schema.sql          Tables, RLS, audit trigger, storage policies
  seed_mnt.sql        One-time historical data load
tools/
  migrate.html        One-time migration tool (delete after use)
```

## Verifying it's actually working

- Open in a private/incognito window: you should be stuck at the login screen, no data loads.
- Sign in with a team account: MNT tab should show live data with working filters/search/sort.
- Open two browser windows signed in as two different accounts, edit different rows in each — both
  changes should appear live in both windows.
- Attach a PDF to a record, reload, click "View PDF" — it should open via a signed URL.
- Before first deploy: search this whole folder for the string `firebase` (case-insensitive) — there
  should be zero matches. That confirms no accidental carryover from the reference file.
