"""Blitz Stock Control - standalone server.

Serves the dashboard and keeps all stock data in one SQLite file (stock.db).
Run with:  python run.py
"""
import hashlib
import io
import shutil
import time
import zipfile
from datetime import date, datetime, timezone
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse

BASE = Path(__file__).parent
DB_PATH = Path(os.environ.get("STOCK_DB", BASE / "stock.db"))
# Team password: the STOCK_PASSWORD setting, or the first line of password.txt next to this file.
# With no password set, the site opens without a sign-in page.
_pw_file = BASE / "password.txt"
PASSWORD = os.environ.get("STOCK_PASSWORD", "") or (_pw_file.read_text(encoding="utf-8").strip().splitlines()[0].strip() if _pw_file.exists() and _pw_file.read_text(encoding="utf-8").strip() else "")
UPLOADS = DB_PATH.parent / "uploads"  # signed handover slips, kept beside the database
FILE_TYPES = {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heic"}
MAX_UPLOAD = 10 * 1024 * 1024
BACKUPS = DB_PATH.parent / "backups"  # automatic daily copies of the database
KEEP_DAILY = 14
MAX_RESTORE = 150 * 1024 * 1024
# Optional key that can do one thing only: download a backup (used by the automatic backup on a PC).
BACKUP_KEY = os.environ.get("BACKUP_KEY", "").strip()
COLLECTIONS = ("quotes", "items", "moves", "handovers", "assets", "pos")
PHOTO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_PHOTOS = 12
ID_OK = re.compile(r"^[A-Za-z0-9_.\-]{1,120}$")

app = FastAPI(title="Blitz Stock Control", docs_url=None, redoc_url=None)
lock = threading.Lock()


def connect():
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode=WAL")
    return con


def init():
    with connect() as con:
        con.execute("CREATE TABLE IF NOT EXISTS docs (collection TEXT, id TEXT, data TEXT, PRIMARY KEY (collection, id))")
        con.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER)")
        con.execute("INSERT OR IGNORE INTO meta VALUES ('version', 0)")
        empty = con.execute("SELECT COUNT(*) FROM docs").fetchone()[0] == 0
        seed = BASE / "seed.json"
        if empty and seed.exists():  # first run: load the starting quotes
            for coll, docs in json.loads(seed.read_text(encoding="utf-8")).items():
                for doc_id, data in docs.items():
                    con.execute("INSERT INTO docs VALUES (?,?,?)", (coll, doc_id, json.dumps(data)))


init()


def token():
    return hmac.new(PASSWORD.encode(), b"blitz-stock-session", hashlib.sha256).hexdigest()


def signed_in(request: Request):
    return not PASSWORD or hmac.compare_digest(request.cookies.get("stock_session", ""), token())


@app.middleware("http")
async def guard(request: Request, call_next):
    path = request.url.path
    if path.startswith("/login") or signed_in(request):
        return await call_next(request)
    if (path == "/api/backup" and request.method == "GET" and len(BACKUP_KEY) >= 24
            and hmac.compare_digest(request.headers.get("x-backup-key", ""), BACKUP_KEY)):
        return await call_next(request)
    if path.startswith("/api/"):
        return JSONResponse({"error": "sign in"}, status_code=401)
    return RedirectResponse("/login")


LOGIN = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blitz Stock Control</title><style>body{font:16px system-ui,sans-serif;background:#150910;color:#fbf3f6;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#22101a;border:1px solid #40202e;border-radius:8px;padding:28px;display:flex;flex-direction:column;gap:12px;width:min(340px,90vw)}
input,button{font:inherit;padding:10px;border-radius:6px;border:1px solid #40202e;background:#150910;color:#fbf3f6}button{background:#d42463;color:#fff;border-color:#d42463;font-weight:600;cursor:pointer}
p{margin:0;color:#ff8a80}</style></head><body><form method="post" action="/login"><h1 style="margin:0;font-size:22px">Blitz Stock Control</h1>
<label for="p">Team password</label><input id="p" name="password" type="password" autofocus required>__MSG__<button>Sign in</button></form></body></html>"""


@app.get("/login", response_class=HTMLResponse)
def login_page():
    return LOGIN.replace("__MSG__", "")


@app.post("/login")
async def login(request: Request):
    form = (await request.body()).decode()
    from urllib.parse import parse_qs
    given = parse_qs(form).get("password", [""])[0]
    if PASSWORD and hmac.compare_digest(given, PASSWORD):
        resp = RedirectResponse("/", status_code=303)
        https = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
        resp.set_cookie("stock_session", token(), httponly=True, secure=https, samesite="lax", max_age=60 * 60 * 24 * 30)
        return resp
    return HTMLResponse(LOGIN.replace("__MSG__", "<p>That password is not right.</p>"), status_code=401)


def bump(con):
    con.execute("UPDATE meta SET value = value + 1 WHERE key = 'version'")


def check(coll, doc_id=None):
    if coll not in COLLECTIONS or (doc_id is not None and not ID_OK.match(doc_id)):
        raise HTTPException(404)


def merge(old, new):
    for k, v in new.items():
        if isinstance(v, dict) and isinstance(old.get(k), dict):
            merge(old[k], v)
        else:
            old[k] = v
    return old


@app.get("/api/version")
def version():
    with connect() as con:
        return {"version": con.execute("SELECT value FROM meta WHERE key='version'").fetchone()[0]}


@app.get("/api/state")
def state():
    with connect() as con:
        data = {c: [] for c in COLLECTIONS}
        for coll, doc_id, raw in con.execute("SELECT collection, id, data FROM docs ORDER BY collection, id"):
            if coll in data:
                data[coll].append({"id": doc_id, "data": json.loads(raw)})
        v = con.execute("SELECT value FROM meta WHERE key='version'").fetchone()[0]
    return {"version": v, "data": data}


@app.post("/api/docs/{coll}")
def add(coll: str, data: dict = Body(...)):
    check(coll)
    doc_id = secrets.token_hex(8)
    with lock, connect() as con:
        con.execute("INSERT INTO docs VALUES (?,?,?)", (coll, doc_id, json.dumps(data)))
        bump(con)
    return {"id": doc_id}


@app.put("/api/docs/{coll}/{doc_id}")
def put(coll: str, doc_id: str, data: dict = Body(...)):
    check(coll, doc_id)
    with lock, connect() as con:
        con.execute("INSERT OR REPLACE INTO docs VALUES (?,?,?)", (coll, doc_id, json.dumps(data)))
        bump(con)
    return {"id": doc_id}


@app.patch("/api/docs/{coll}/{doc_id}")
def patch(coll: str, doc_id: str, data: dict = Body(...)):
    check(coll, doc_id)
    with lock, connect() as con:
        row = con.execute("SELECT data FROM docs WHERE collection=? AND id=?", (coll, doc_id)).fetchone()
        if not row:
            raise HTTPException(404)
        con.execute("UPDATE docs SET data=? WHERE collection=? AND id=?", (json.dumps(merge(json.loads(row[0]), data)), coll, doc_id))
        bump(con)
    return {"id": doc_id}


@app.delete("/api/docs/{coll}/{doc_id}")
def delete(coll: str, doc_id: str):
    check(coll, doc_id)
    with lock, connect() as con:
        row = con.execute("SELECT data FROM docs WHERE collection=? AND id=?", (coll, doc_id)).fetchone()
        if row and coll in ("assets", "handovers", "pos"):  # remove this record's uploaded files too
            doc = json.loads(row[0])
            names = [p.get("file") for p in doc.get("photos") or []] + [(doc.get("signed") or {}).get("file"), (doc.get("doc") or {}).get("file")]
            for name in names:
                if name and ID_OK.match(name) and (UPLOADS / name).is_file():
                    (UPLOADS / name).unlink()
        con.execute("DELETE FROM docs WHERE collection=? AND id=?", (coll, doc_id))
        bump(con)
    return {"ok": True}


@app.post("/api/signed/{doc_id}")
async def upload_signed(doc_id: str, request: Request):
    """Attach a signed slip (photo or PDF) to a handover."""
    return await attach(request, "handovers", doc_id, "signed")


@app.post("/api/podoc/{doc_id}")
async def upload_podoc(doc_id: str, request: Request):
    """Attach the PO document (PDF or photo) to a purchase order."""
    return await attach(request, "pos", doc_id, "doc")


@app.delete("/api/podoc/{doc_id}")
def remove_podoc(doc_id: str):
    return detach("pos", doc_id, "doc")


async def attach(request: Request, coll: str, doc_id: str, field: str):
    from urllib.parse import unquote
    check(coll, doc_id)
    ext = FILE_TYPES.get(request.headers.get("content-type", "").split(";")[0].strip().lower())
    if not ext:
        raise HTTPException(415)
    data = await request.body()
    if not data:
        raise HTTPException(400)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413)
    with lock, connect() as con:
        row = con.execute("SELECT data FROM docs WHERE collection=? AND id=?", (coll, doc_id)).fetchone()
        if not row:
            raise HTTPException(404)
        doc = json.loads(row[0])
        UPLOADS.mkdir(parents=True, exist_ok=True)
        old = (doc.get(field) or {}).get("file")
        name = f"{doc_id}-{secrets.token_hex(6)}.{ext}"
        (UPLOADS / name).write_bytes(data)
        if old and ID_OK.match(old) and (UPLOADS / old).is_file():
            (UPLOADS / old).unlink()
        from datetime import datetime, timezone
        doc[field] = {"file": name, "name": unquote(request.headers.get("x-filename", ""))[:200],
                         "by": unquote(request.headers.get("x-by", ""))[:100], "at": datetime.now(timezone.utc).isoformat()}
        con.execute("UPDATE docs SET data=? WHERE collection=? AND id=?", (json.dumps(doc), coll, doc_id))
        bump(con)
    return {"file": name}


@app.post("/api/photo/{doc_id}")
async def upload_photo(doc_id: str, request: Request):
    """Add a photo to an asset in the asset register."""
    from datetime import datetime, timezone
    from urllib.parse import unquote
    check("assets", doc_id)
    ext = PHOTO_TYPES.get(request.headers.get("content-type", "").split(";")[0].strip().lower())
    if not ext:
        raise HTTPException(415)
    data = await request.body()
    if not data:
        raise HTTPException(400)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413)
    with lock, connect() as con:
        row = con.execute("SELECT data FROM docs WHERE collection='assets' AND id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(404)
        doc = json.loads(row[0])
        photos = doc.get("photos") or []
        if len(photos) >= MAX_PHOTOS:
            raise HTTPException(409)
        UPLOADS.mkdir(parents=True, exist_ok=True)
        name = f"{doc_id}-{secrets.token_hex(6)}.{ext}"
        (UPLOADS / name).write_bytes(data)
        photos.append({"file": name, "by": unquote(request.headers.get("x-by", ""))[:100], "at": datetime.now(timezone.utc).isoformat()})
        doc["photos"] = photos
        con.execute("UPDATE docs SET data=? WHERE collection='assets' AND id=?", (json.dumps(doc), doc_id))
        bump(con)
    return {"file": name}


@app.delete("/api/photo/{doc_id}/{name}")
def remove_photo(doc_id: str, name: str):
    check("assets", doc_id)
    if not ID_OK.match(name):
        raise HTTPException(404)
    with lock, connect() as con:
        row = con.execute("SELECT data FROM docs WHERE collection='assets' AND id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(404)
        doc = json.loads(row[0])
        if not any(p.get("file") == name for p in doc.get("photos") or []):
            raise HTTPException(404)
        doc["photos"] = [p for p in doc["photos"] if p.get("file") != name]
        if (UPLOADS / name).is_file():
            (UPLOADS / name).unlink()
        con.execute("UPDATE docs SET data=? WHERE collection='assets' AND id=?", (json.dumps(doc), doc_id))
        bump(con)
    return {"ok": True}


@app.delete("/api/signed/{doc_id}")
def remove_signed(doc_id: str):
    return detach("handovers", doc_id, "signed")


def detach(coll: str, doc_id: str, field: str):
    check(coll, doc_id)
    with lock, connect() as con:
        row = con.execute("SELECT data FROM docs WHERE collection=? AND id=?", (coll, doc_id)).fetchone()
        if not row:
            raise HTTPException(404)
        doc = json.loads(row[0])
        old = (doc.pop(field, None) or {}).get("file")
        if old and ID_OK.match(old) and (UPLOADS / old).is_file():
            (UPLOADS / old).unlink()
        con.execute("UPDATE docs SET data=? WHERE collection=? AND id=?", (json.dumps(doc), coll, doc_id))
        bump(con)
    return {"ok": True}


@app.get("/api/files/{name}")
def signed_file(name: str):
    if not ID_OK.match(name) or not (UPLOADS / name).is_file():
        raise HTTPException(404)
    return FileResponse(UPLOADS / name, headers={"Content-Disposition": f'inline; filename="{name}"', "X-Content-Type-Options": "nosniff"})


# ---------- backups ----------
def copy_db(dest: Path):
    """Write a consistent copy of the live database to dest, even while people are using the site."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    src, dst = connect(), sqlite3.connect(dest)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()


def daily_copy():
    """Keep one copy per day on the server, for the last KEEP_DAILY days."""
    today_file = BACKUPS / f"stock-{date.today().isoformat()}.db"
    if not today_file.exists():
        copy_db(today_file)
    for old in sorted(BACKUPS.glob("stock-*.db"))[:-KEEP_DAILY]:
        old.unlink()


def _daily_loop():
    while True:
        try:
            daily_copy()
        except Exception as exc:  # never let a failed copy stop the site
            print("daily backup failed:", exc)
        time.sleep(3 * 60 * 60)


threading.Thread(target=_daily_loop, daemon=True).start()


@app.get("/api/backups")
def list_backups():
    files = sorted(BACKUPS.glob("stock-*.db")) if BACKUPS.exists() else []
    return {"daily": [f.stem.replace("stock-", "") for f in files], "keep": KEEP_DAILY}


@app.get("/api/backup")
def download_backup():
    """One zip with the database, a readable copy of the data, and every uploaded photo and signed slip."""
    BACKUPS.mkdir(parents=True, exist_ok=True)
    snap, out = BACKUPS / "_snapshot.db", BACKUPS / "_download.zip"
    with lock:
        copy_db(snap)
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(snap, "stock.db")
            z.writestr("data.json", json.dumps(state(), indent=1))
            z.writestr("README.txt", "Blitz Stock Control backup, made " + datetime.now(timezone.utc).isoformat() + " UTC.\n"
                       "stock.db is the full database. uploads/ holds asset photos and signed slips. data.json is a readable copy.\n"
                       "To restore: on the website open the Quotes tab, Backup section, and choose this zip file.\n")
            if UPLOADS.exists():
                for f in sorted(UPLOADS.iterdir()):
                    if f.is_file():
                        z.write(f, "uploads/" + f.name)
        snap.unlink()
    return FileResponse(out, media_type="application/zip", filename=f"blitz-stock-backup-{date.today().isoformat()}.zip")


@app.post("/api/restore")
async def restore(request: Request):
    """Replace all data with the contents of a backup zip. The current data is copied aside first."""
    body = await request.body()
    if not body or len(body) > MAX_RESTORE:
        raise HTTPException(413)
    try:
        z = zipfile.ZipFile(io.BytesIO(body))
        raw = z.read("stock.db")
    except Exception:
        raise HTTPException(400, "not a backup file")
    BACKUPS.mkdir(parents=True, exist_ok=True)
    incoming = BACKUPS / "_incoming.db"
    incoming.write_bytes(raw)
    try:
        chk = sqlite3.connect(incoming)
        n = chk.execute("SELECT COUNT(*) FROM docs").fetchone()[0]
        chk.execute("SELECT value FROM meta WHERE key='version'").fetchone()[0]
        chk.close()
    except Exception:
        incoming.unlink(missing_ok=True)
        raise HTTPException(400, "not a backup file")
    with lock:
        old_version = version()["version"]
        copy_db(BACKUPS / f"before-restore-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db")
        src, dst = sqlite3.connect(incoming), connect()
        try:
            src.backup(dst)
            dst.execute("UPDATE meta SET value = MAX(value, ?) + 1 WHERE key='version'", (old_version,))
            dst.commit()
        finally:
            src.close()
            dst.close()
        incoming.unlink(missing_ok=True)
        UPLOADS.mkdir(parents=True, exist_ok=True)
        files = 0
        for name in z.namelist():
            base = name[len("uploads/"):] if name.startswith("uploads/") else ""
            if base and ID_OK.match(base):
                (UPLOADS / base).write_bytes(z.read(name))
                files += 1
    return {"records": n, "files": files}


# The dashboard files normally sit in static/ (page) and static/vendor/ (scripts), but they are
# also found if an upload flattened the folders, so a lost folder structure does not stop the site.
def find(name, *folders):
    for folder in folders:
        path = BASE / folder / name
        if path.is_file():
            return path
    return None


@app.get("/")
def index():
    # If an upload left more than one copy, serve the newest (highest app-build number).
    def build(path):
        m = re.search(r'name="app-build" content="(\d+)"', path.read_text(encoding="utf-8", errors="ignore")[:2000])
        return int(m.group(1)) if m else 0
    pages = [p for p in (BASE / "static" / "index.html", BASE / "index.html") if p.is_file()]
    page = max(pages, key=build) if pages else None
    if not page:
        return HTMLResponse("<h1>Blitz Stock Control</h1><p>The server is running, but index.html is missing. "
                            "Upload the static folder from the project.</p>", status_code=500)
    return FileResponse(page, headers={"Cache-Control": "no-cache"})


@app.get("/static/vendor/{name}")
def vendor(name: str):
    if not re.match(r"^[A-Za-z0-9_.\-]+\.js$", name):
        raise HTTPException(404)
    path = find(name, "static/vendor", "vendor", "static", "")
    if not path:
        raise HTTPException(404)
    return FileResponse(path, media_type="text/javascript")
