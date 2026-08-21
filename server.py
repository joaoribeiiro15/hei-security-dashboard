#!/usr/bin/env python3
"""HEI Security Dashboard — Backend server.

Endpoints
---------
GET  /geo.geojson?country=XX  -> NUTS2 GeoJSON for a given country
GET  /data                    -> Auto-load all CSVs from data/ directory
GET  /login                   -> Standalone login page
POST /auth                    -> Validate credentials against MySQL; returns token
POST /upload                  -> Manual CSV upload (multipart/form-data)
GET  /<anything else>         -> Static file under html/
"""

import hashlib
import hmac
import json
import mimetypes
import os
import re
import sys
import time
import traceback
import urllib.request
from urllib.parse import unquote as _url_unquote
from pathlib import Path
from wsgiref.simple_server import make_server, WSGIRequestHandler

try:
    import pymysql
    import pymysql.cursors
    _HAVE_MYSQL = True
except ImportError:
    _HAVE_MYSQL = False
    print("[warn] PyMySQL not installed — /auth will always fail", flush=True)

try:
    import bcrypt as _bcrypt
    _HAVE_BCRYPT = True
except ImportError:
    _HAVE_BCRYPT = False

PORT      = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
HTML_DIR  = Path(__file__).resolve().parent / "html"
CACHE_DIR = Path(__file__).resolve().parent / "cache"
DATA_DIR  = Path(__file__).resolve().parent / "data"
CACHE_DIR.mkdir(exist_ok=True)

# Maps synthetic-name → real Path. Populated by _build_manifest().
# Single-threaded WSGI (wsgiref) — no locking required.
_file_registry: dict = {}

# ── Auth config ───────────────────────────────────────────────────────────────
TOY_SECRET      = os.environ.get("TOY_SECRET", "CHANGE_ME").encode()
SESSION_SECONDS = int(os.environ.get("SESSION_SECONDS", 28800))
USE_BCRYPT      = os.environ.get("USE_BCRYPT", "1").strip() == "1"

# ── MySQL config ──────────────────────────────────────────────────────────────
DB_HOST     = os.environ.get("DB_HOST", "db")
DB_PORT     = int(os.environ.get("DB_PORT", 3306))
DB_NAME     = os.environ.get("DB_NAME", "hei_dashboard")
DB_USER     = os.environ.get("DB_USER", "hei_app")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "CHANGE_ME")

GISCO_BASE = "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson"

COUNTRY_CONFIG = {
    "no": {"cntr": "NO", "levl": 1},
}


def _default_config(code):
    return {"cntr": code.upper(), "levl": 2}


# =============================================================================
# Token signing — toy HMAC-SHA256, mirrored in login.html
# =============================================================================

def _b64url_encode(data: bytes) -> str:
    import base64
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_json(obj: dict) -> str:
    import base64
    raw = json.dumps(obj, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _toy_sign(message: str) -> str:
    sig = hmac.new(TOY_SECRET, message.encode(), hashlib.sha256).digest()
    return _b64url_encode(sig)


def mint_token(user: dict) -> str:
    now = int(time.time() * 1000)
    hdr = _b64url_json({"alg": "toy-HS256", "typ": "JWT"})
    pld = _b64url_json({
        "sub":         user["username"],
        "role":        user["role"],
        "country":     user.get("country"),
        "displayName": user.get("display_name", user["username"]),
        "iat":         now,
        "exp":         now + SESSION_SECONDS * 1000,
    })
    sig = _toy_sign(hdr + "." + pld)
    return f"{hdr}.{pld}.{sig}"


# =============================================================================
# MySQL auth
# =============================================================================

def _db_connect():
    if not _HAVE_MYSQL:
        raise RuntimeError("PyMySQL not installed")
    return pymysql.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=5,
    )


def _verify_password(plain: str, stored: str) -> bool:
    if USE_BCRYPT and _HAVE_BCRYPT:
        try:
            return _bcrypt.checkpw(plain.encode(), stored.encode())
        except Exception:
            return False
    return plain == stored


def authenticate(username: str, password: str):
    """Return user row dict on success, None on failure."""
    try:
        conn = _db_connect()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT username, password, role, country, display_name "
                    "FROM users WHERE username = %s AND active = 1 LIMIT 1",
                    (username,)
                )
                row = cur.fetchone()
        if not row:
            return None
        if not _verify_password(password, row["password"]):
            return None
        return row
    except Exception as exc:
        print(f"[auth] DB error: {exc}", flush=True)
        return None


# =============================================================================
# GeoJSON
# =============================================================================

def get_geo(country_code):
    cc  = country_code.lower()
    cfg = COUNTRY_CONFIG.get(cc, _default_config(cc))
    empty = json.dumps({"type": "FeatureCollection", "features": []}).encode()

    # Cache filename carries the NUTS vintage so that upgrading the vintage
    # invalidates stale files instead of serving the old geometry forever.
    cache_file = CACHE_DIR / f"nuts_geo_2024_{cc}.geojson"
    if cache_file.exists():
        raw = cache_file.read_bytes()
        try:
            n = len(json.loads(raw).get("features", []))
        except Exception:
            n = 0
        if n > 0:
            print(f"[geo/{cc}] Cache hit: {n} features", flush=True)
            return raw, None
        cache_file.unlink()

    bundled = HTML_DIR / "geo" / f"{cc}.geojson"
    if bundled.exists():
        raw = bundled.read_bytes()
        try:
            n = len(json.loads(raw).get("features", []))
        except Exception:
            n = 0
        if n > 0:
            print(f"[geo/{cc}] Bundled: {n} features", flush=True)
            cache_file.write_bytes(raw)
            return raw, None

    url = f"{GISCO_BASE}/NUTS_RG_60M_2024_4326_LEVL_{cfg['levl']}.geojson"
    print(f"[geo/{cc}] Downloading {url}", flush=True)
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (HEI-Dashboard/1.0)",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=45) as r:
            data_raw = r.read()
        data     = json.loads(data_raw)
        features = [f for f in data["features"]
                    if f["properties"].get("CNTR_CODE") == cfg["cntr"]]
        geo  = {"type": "FeatureCollection", "features": features}
        body = json.dumps(geo, separators=(",", ":")).encode()
        cache_file.write_bytes(body)
        print(f"[geo/{cc}] Downloaded {len(features)} features", flush=True)
        return body, None
    except Exception as e:
        print(f"[geo/{cc}] Download failed: {e}", flush=True)
        return empty, str(e)


# =============================================================================
# Multipart parser
# =============================================================================

def parse_multipart(body, boundary):
    results = []
    parts = body.split(b"--" + boundary)
    for part in parts:
        if not part or part.strip() in (b"", b"--", b"--\r\n"):
            continue
        if b"\r\n\r\n" in part:
            header_block, file_data = part.split(b"\r\n\r\n", 1)
        elif b"\n\n" in part:
            header_block, file_data = part.split(b"\n\n", 1)
        else:
            continue
        if file_data.endswith(b"\r\n"):
            file_data = file_data[:-2]
        header_str = header_block.decode("utf-8", errors="replace")
        fn_match   = re.search(r'filename="([^"]*)"', header_str)
        if fn_match and fn_match.group(1):
            results.append({"filename": fn_match.group(1), "data": file_data})
    return results


# =============================================================================
# Response helpers
# =============================================================================

def json_response(start_response, code, data):
    body = json.dumps(data).encode()
    status = {
        200: "200 OK",
        400: "400 Bad Request",
        401: "401 Unauthorized",
        404: "404 Not Found",
        500: "500 Internal Server Error",
    }.get(code, "500 Internal Server Error")
    start_response(status, [
        ("Content-Type",   "application/json"),
        ("Content-Length", str(len(body))),
        ("Cache-Control",  "no-store"),
        ("Access-Control-Allow-Origin", "*"),
    ])
    return [body]


def serve_static(path, start_response):
    safe = path.lstrip("/") or "index.html"
    safe = safe.split("?")[0]
    full = (HTML_DIR / safe).resolve()
    try:
        full.relative_to(HTML_DIR)
    except ValueError:
        start_response("403 Forbidden", [("Content-Length", "0")])
        return [b""]
    if not full.is_file():
        body = b"Not found"
        start_response("404 Not Found", [
            ("Content-Type",  "text/plain"),
            ("Content-Length", str(len(body))),
        ])
        return [body]
    mime, _ = mimetypes.guess_type(str(full))
    mime     = mime or "application/octet-stream"
    data     = full.read_bytes()
    start_response("200 OK", [
        ("Content-Type",   mime),
        ("Content-Length", str(len(data))),
    ])
    return [data]


# =============================================================================
# /data — auto-load CSVs from bind-mounted data/ directory
# =============================================================================

_SCANNER_FILES = {
    "dnssec_consolidated_result.csv",
    "https_consolidate_result.csv",
    "sh_final_result_with_scores_unique_hei.csv",
}
_NOISE_PREFIXES    = ("final_result_", "final_classification_", "nuts_scores")
_NOISE_SUBSTR      = ("_errors_",)
_NOISE_RAW_HEADERS = ("_desktop.csv", "_mobile.csv")

# Timestamped snapshots have the form "<base>__YYYY-MM-DDTHH-MM-SS.csv",
# written by the Thesis Scripts unified CLI so the dashboard can build a
# Timeline view. The regex is permissive about the time portion (hours may
# be absent for backwards compatibility) but the date must be present.
import re as _re
_STAMP_RE = _re.compile(r"^(?P<base>.+?)__(?P<ts>\d{4}-\d{2}-\d{2}(?:T\d{2}-\d{2}-\d{2})?)(?P<ext>\.[^.]+)$")


def _strip_stamp(name):
    """Return (base_name, timestamp_or_None) for a possibly-stamped filename.

    Examples:
        "dnssec_consolidated_result__2026-04-24T08-30-15.csv" -> ("dnssec_consolidated_result.csv", "2026-04-24T08-30-15")
        "dnssec_consolidated_result.csv"                      -> ("dnssec_consolidated_result.csv", None)
    """
    m = _STAMP_RE.match(name)
    if not m:
        return name, None
    return m.group("base") + m.group("ext"), m.group("ts")


def _is_hei_source(name):
    base, _ = _strip_stamp(name)
    return base.lower().endswith(".csv") and "heis" in base.lower()


def _is_llm_analysis(name):
    base, _ = _strip_stamp(name)
    low = base.lower()
    return low.endswith(".csv") and ("risk_analysis_summary" in low or "llm_analysis" in low)


def _is_accepted(name):
    low = name.lower()
    if not low.endswith(".csv"):                           return False
    if any(low.startswith(p) for p in _NOISE_PREFIXES):  return False
    if any(s in low for s in _NOISE_SUBSTR):              return False
    if any(low.endswith(s) for s in _NOISE_RAW_HEADERS): return False
    base, _ = _strip_stamp(name)
    if base in _SCANNER_FILES:                            return True
    if _is_hei_source(name):                              return True
    if _is_llm_analysis(name):                            return True
    return (base.endswith("_dnssec_scanner.csv") or
            base.endswith("_https_scanner.csv"))


def _synthetic_path(name):
    base, _ = _strip_stamp(name)
    if base == "dnssec_consolidated_result.csv" or base.endswith("_dnssec_scanner.csv"):
        return f"src/results/dnssec/{name}"
    if base == "https_consolidate_result.csv" or base.endswith("_https_scanner.csv"):
        return f"src/results/https/{name}"
    if base == "sh_final_result_with_scores_unique_hei.csv":
        return f"src/results/headers/{name}"
    if _is_hei_source(name):
        return f"src/source/{name}"
    if _is_llm_analysis(name):
        return f"src/results/llm_analysis/{name}"
    return f"src/{name}"


def _country_hint(p):
    parts = [pt.lower() for pt in p.parts]
    try:
        idx = parts.index("data")
        if idx + 1 < len(parts):
            seg = parts[idx + 1]
            if len(seg) == 2 and seg.isalpha():
                return seg
    except ValueError:
        pass
    return ""


def _build_manifest():
    """Walk DATA_DIR, apply same filters/dedup as load_data_dir(), populate
    _file_registry, and return [{name: synthetic_name, size: int}, ...]."""
    global _file_registry
    _file_registry = {}
    manifest = []
    if not DATA_DIR.exists():
        return manifest

    candidates = []
    for root, dirs, files in os.walk(DATA_DIR):
        dirs[:] = [d for d in dirs if d not in (
            "analysis", "errors", "bkp", "test", "original",
            "tables", "charts", "choropleth_map",
            # Scanner module directories — these contain intermediate/raw
            # data files from the scanner source code, not final results.
            # Walking into them causes their internal consolidated files to
            # suppress the actual dashboard result files (e.g. the unstamped
            # http_scanner/src/data/reports/https_consolidate_result.csv
            # suppresses all unstamped per-country _https_scanner.csv files).
            "http_scanner", "dnssec_scanner", "security_headers_scanner",
            # "latest/" mirrors the newest timestamped snapshot byte-for-byte
            # (same run, just unstamped for convenience). Including it as well
            # doubles the transfer/parse cost of every https/dnssec/headers
            # file for no benefit — the timestamped copy already covers it.
            "latest",
        )]
        for fn in files:
            if _is_accepted(fn):
                candidates.append(Path(root) / fn)

    consolidated_runs = {
        "dnssec_consolidated_result.csv": set(),
        "https_consolidate_result.csv":   set(),
    }
    for p in candidates:
        base, ts = _strip_stamp(p.name)
        if base in consolidated_runs:
            consolidated_runs[base].add(ts)

    seen_names = {}
    for p in sorted(candidates, key=lambda x: (x.name, str(x))):
        fn = p.name
        base, ts = _strip_stamp(fn)
        if base.endswith("_dnssec_scanner.csv") and ts in consolidated_runs["dnssec_consolidated_result.csv"]:
            continue
        if base.endswith("_https_scanner.csv") and ts in consolidated_runs["https_consolidate_result.csv"]:
            continue

        if fn in seen_names:
            seen_names[fn] += 1
            stem, dot, ext = fn.rpartition(".")
            hint = _country_hint(p) or str(seen_names[fn])
            unique_fn = f"{stem}__{hint}.{ext}" if dot else f"{fn}__{hint}"
        else:
            seen_names[fn] = 1
            unique_fn = fn

        synthetic = _synthetic_path(unique_fn)
        _file_registry[synthetic] = p
        manifest.append({"name": synthetic, "size": p.stat().st_size})
        print(f"[manifest] {p.relative_to(DATA_DIR)} -> {synthetic}", flush=True)

    return manifest


def load_data_dir():
    results = []
    if not DATA_DIR.exists():
        return results

    candidates = []
    for root, dirs, files in os.walk(DATA_DIR):
        # Prune noise subdirectories in-place so os.walk does not descend into them.
        # "analysis/" contains intermediate per-run breakdown files that are not
        # scanner outputs; descending into it causes duplicate ingestion.
        dirs[:] = [d for d in dirs if d not in (
            "analysis", "errors", "bkp", "test", "original",
            "tables", "charts", "choropleth_map",
            "http_scanner", "dnssec_scanner", "security_headers_scanner",
            "latest",
        )]
        for fn in files:
            if _is_accepted(fn):
                candidates.append(Path(root) / fn)

    # For snapshot-aware dedup: a consolidated file and its per-country
    # siblings must share a run (same timestamp, or both unstamped) before
    # the per-country files can be suppressed. Otherwise snapshots from
    # different runs cannibalise each other.
    consolidated_runs = {
        "dnssec_consolidated_result.csv": set(),
        "https_consolidate_result.csv":   set(),
    }
    for p in candidates:
        base, ts = _strip_stamp(p.name)
        if base in consolidated_runs:
            consolidated_runs[base].add(ts)  # ts may be None

    seen_names = {}

    for p in sorted(candidates, key=lambda x: (x.name, str(x))):
        fn = p.name
        base, ts = _strip_stamp(fn)

        # Only suppress a per-country file when a consolidated from the
        # same run (same timestamp, or both unstamped) is also present.
        if base.endswith("_dnssec_scanner.csv") and ts in consolidated_runs["dnssec_consolidated_result.csv"]:
            continue
        if base.endswith("_https_scanner.csv")  and ts in consolidated_runs["https_consolidate_result.csv"]:
            continue

        try:
            raw  = p.read_bytes()
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                text = p.read_bytes().decode("latin-1")
            except Exception as e:
                results.append({"name": _synthetic_path(fn), "text": "", "error": str(e)})
                continue
        except Exception as e:
            results.append({"name": _synthetic_path(fn), "text": "", "error": str(e)})
            continue

        if fn in seen_names:
            seen_names[fn] += 1
            stem, dot, ext = fn.rpartition(".")
            hint      = _country_hint(p) or str(seen_names[fn])
            unique_fn = f"{stem}__{hint}.{ext}" if dot else f"{fn}__{hint}"
        else:
            seen_names[fn] = 1
            unique_fn = fn

        results.append({"name": _synthetic_path(unique_fn), "text": text, "error": None})
        print(f"[GET /data] {p.relative_to(DATA_DIR)} -> {_synthetic_path(unique_fn)}",
              flush=True)

    return results


# =============================================================================
# WSGI application
# =============================================================================

def app(environ, start_response):
    method   = environ["REQUEST_METHOD"]
    raw_path = environ.get("PATH_INFO", "/")
    query    = environ.get("QUERY_STRING", "")
    path     = raw_path.split("?")[0]

    params = {}
    for part in query.split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
            params[k] = v

    # GET /geo.geojson
    if method == "GET" and path == "/geo.geojson":
        cc = params.get("country", "no").lower()
        body, err = get_geo(cc)
        if err:
            return json_response(start_response, 500,
                                 {"error": f"Failed to fetch geo data: {err}"})
        start_response("200 OK", [
            ("Content-Type",   "application/geo+json"),
            ("Content-Length", str(len(body))),
            ("Cache-Control",  "public, max-age=86400"),
            ("Access-Control-Allow-Origin", "*"),
        ])
        return [body]

    # GET /file?name=<synthetic_name>
    if method == "GET" and path == "/file":
        synthetic = _url_unquote(params.get("name", "").strip())
        if not synthetic:
            return json_response(start_response, 400,
                                 {"name": "", "text": "", "error": "Missing ?name="})
        # Rebuild registry if empty (e.g. server restart, /file called before /data)
        if synthetic not in _file_registry:
            _build_manifest()
        real_path = _file_registry.get(synthetic)
        if real_path is None:
            print(f"[GET /file] Not found: {synthetic!r}", flush=True)
            return json_response(start_response, 200,
                                 {"name": synthetic, "text": "", "error": "File not found"})
        # Defence-in-depth: verify path stays inside DATA_DIR
        try:
            real_path.resolve().relative_to(DATA_DIR.resolve())
        except ValueError:
            return json_response(start_response, 200,
                                 {"name": synthetic, "text": "", "error": "File not found"})
        try:
            raw  = real_path.read_bytes()
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                text = real_path.read_bytes().decode("latin-1")
            except Exception as exc:
                return json_response(start_response, 200,
                                     {"name": synthetic, "text": "", "error": str(exc)})
        except Exception as exc:
            return json_response(start_response, 200,
                                 {"name": synthetic, "text": "", "error": str(exc)})
        print(f"[GET /file] {real_path.relative_to(DATA_DIR)} -> {synthetic}", flush=True)
        return json_response(start_response, 200,
                             {"name": synthetic, "text": text, "error": None})

    # GET /data  — manifest only; file contents served individually via GET /file
    if method == "GET" and path == "/data":
        try:
            manifest = _build_manifest()
            print(f"[GET /data] {len(manifest)} file(s) in manifest", flush=True)
            return json_response(start_response, 200, manifest)
        except Exception as e:
            print(f"[GET /data] EXCEPTION: {e}", flush=True)
            traceback.print_exc()
            return json_response(start_response, 500, {"error": str(e)})

    # GET /login
    if method == "GET" and path == "/login":
        login_file = HTML_DIR / "login.html"
        if not login_file.is_file():
            body = b"Login page not found"
            start_response("404 Not Found", [
                ("Content-Type",   "text/plain"),
                ("Content-Length", str(len(body))),
            ])
            return [body]
        data = login_file.read_bytes()
        start_response("200 OK", [
            ("Content-Type",   "text/html; charset=utf-8"),
            ("Content-Length", str(len(data))),
            ("Cache-Control",  "no-store"),
        ])
        return [data]

    # POST /auth
    if method == "POST" and path == "/auth":
        try:
            length = int(environ.get("CONTENT_LENGTH") or 0)
            body   = environ["wsgi.input"].read(length) if length > 0 else b""
            try:
                payload = json.loads(body.decode("utf-8"))
            except Exception:
                return json_response(start_response, 400, {"error": "Invalid JSON"})

            username = str(payload.get("username", "")).strip()
            password = str(payload.get("password", ""))

            if not username or not password:
                return json_response(start_response, 400,
                                     {"error": "Missing credentials"})

            user = authenticate(username, password)
            if not user:
                print(f"[POST /auth] Failed login for '{username}'", flush=True)
                return json_response(start_response, 401,
                                     {"error": "Invalid username or password"})

            token = mint_token(user)
            print(f"[POST /auth] Token issued for '{username}' "
                  f"(role={user['role']})", flush=True)
            return json_response(start_response, 200, {"token": token})

        except Exception as e:
            print(f"[POST /auth] EXCEPTION: {e}", flush=True)
            traceback.print_exc()
            return json_response(start_response, 500,
                                 {"error": "Internal server error"})

    # POST /upload
    if method == "POST" and path == "/upload":
        content_type = environ.get("CONTENT_TYPE", "")
        if "multipart/form-data" not in content_type:
            return json_response(start_response, 400,
                                 {"error": "Expected multipart/form-data"})

        boundary = None
        for param in content_type.split(";"):
            param = param.strip()
            if param.startswith("boundary="):
                boundary = param.split("=", 1)[1].strip().encode()
                break

        if not boundary:
            return json_response(start_response, 400, {"error": "No boundary"})

        try:
            length     = int(environ.get("CONTENT_LENGTH") or 0)
            wsgi_input = environ["wsgi.input"]
            body = wsgi_input.read(length) if length > 0 else wsgi_input.read()

            if not body:
                return json_response(start_response, 400, {"error": "Empty body"})

            files   = parse_multipart(body, boundary)
            results = []
            for f in files:
                try:
                    text = f["data"].decode("utf-8-sig")
                except UnicodeDecodeError:
                    text = f["data"].decode("latin-1")
                results.append({"name": f["filename"], "text": text, "error": None})

            return json_response(start_response, 200, results)

        except Exception as e:
            print(f"[POST /upload] EXCEPTION: {e}", flush=True)
            traceback.print_exc()
            return json_response(start_response, 500, {"error": str(e)})

    # Static files
    if method == "GET":
        return serve_static(path, start_response)

    return json_response(start_response, 404, {"error": "Not found"})


class QuietHandler(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[http] {fmt % args}", flush=True)


if __name__ == "__main__":
    print(f"Serving from: {HTML_DIR}", flush=True)
    print(f"Data dir:     {DATA_DIR} (exists={DATA_DIR.exists()})", flush=True)
    print(f"DB:           {DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}", flush=True)
    print(f"Use bcrypt:   {USE_BCRYPT}", flush=True)
    print(f"Dashboard:    http://localhost:{PORT}", flush=True)
    with make_server("0.0.0.0", PORT, app, handler_class=QuietHandler) as srv:
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")