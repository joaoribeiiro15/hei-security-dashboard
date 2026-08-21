# HEI Web Security Assessment, Dashboard

A local research platform for visualising and exploring the results of
automated web security scans conducted as part of a Master's thesis at
Østfold University College (Høgskolen i Østfold, HiØ), Norway.

---

## Research context

**Thesis title:** *An Assessment of Web-Related Security in Norwegian Higher
Education Institutions (HEIs)*
**Student:** João Ribeiro
**Institution:** Østfold University College (HiØ), Norway
**Primary supervisor:** Pedro Filipe Cruz Pinto (IPVC, Portugal)
**Co-supervisor:** Vikash Katta (Western Norway University of Applied Sciences, HVL)
**Methodology base:** Barreto et al., *ICISSP 2024* (adapted to Norwegian context)

---

## Data availability

**This repository contains code only.** All scan results, consolidated datasets,
and derived reports have been removed, because they contain per-institution
security findings that cannot be published.

`data/` and `cache/` ship empty (with a `.gitkeep` placeholder). To use the
dashboard, generate your own scan output with the
[HEI Security Scanner](../hei-security-scanner) and drop the resulting CSVs into
`data/` (see **Loading data** below).

---

## Features

### MySQL-backed authentication

User accounts live in a MySQL 8.4 container (`hei-dashboard-db`). The Python
backend exposes a `POST /auth` endpoint that validates credentials against the
database and issues a signed session token.

To add, remove, or update users edit `users/seed.sql` and reset the database
volume (see **User management** below).

### Roles

There are two roles. **Regional Admin** grants access to all analysis tabs
(Overview, HTTPS/TLS, DNSSEC, Security Headers, Institutions Table, NUTS2 Map).
**Global Admin** additionally gets the **Data Management** tab and the
**PDF Report**.

### Norway NUTS2 regions

The map and all regional charts use the six canonical SSB NUTS2 regions:

| Code  | Region                    |
|-------|---------------------------|
| NO0A  | Vestlandet                |
| NO02  | Innlandet                 |
| NO06  | Trøndelag                 |
| NO07  | Nord-Norge                |
| NO08  | Oslo og Viken             |
| NO09  | Agder og Sør-Østlandet    |

Labels are applied from the authoritative SSB classification regardless of
what the CSV file contains, so partial or legacy label values in scanner
outputs are corrected automatically.

### AI recommendations in institution detail view

When a `risk_analysis_summary_*.csv` produced by `llm_risk_analysis.py` is
loaded alongside the scanner CSVs, every failing or warning audit card in the
institution detail view shows an **AI Recommendation** block. The
recommendations are institution-specific: they include the institution name,
primary domain, and the actual scan value that triggered the finding.

For institutions where the LLM did not generate a finding for a particular
check, the platform automatically falls back to rule-based text derived from
the same scanner data, so every flagged item always has an actionable
explanation.

To enable this feature, place the `risk_analysis_summary_*.csv` file in the
same `data/` directory as the scanner CSVs. The file is recognised and loaded
automatically on login.

### Snapshot bar and per-section comparisons

The dashboard exposes a **persistent snapshot bar** below the country selector,
with two dropdowns: the snapshot you are viewing (A) and an optional comparison
snapshot (B). The bar appears automatically when at least two stamped snapshots
are loaded for the active country.

Choosing different values in the bar re-renders every analysis tab against
the chosen snapshot. When a comparison snapshot is selected, every stat
card on Overview, HTTPS, DNSSEC, and Security Headers shows an
inline delta pill (▲ green for upward movement, ▼ red for downward,
±0 grey for unchanged) so you can spot shifts at a glance.

Overview also shows a **trend mini-chart** above the grade-distribution
charts, plotting average HTTPS/Headers scores and DNSSEC adoption
across all stored snapshots in a single line graph.

Snapshots rely on two conventions produced by the scanner:

- Every result CSV is written with a `__YYYY-MM-DDTHH-MM-SS` suffix in
  its filename, derived from the run that produced it.
- Every CSV row carries a `run_timestamp` column identifying the same
  run.

Dropping any set of timestamped CSVs onto the dashboard (or placing them
in `data/` at container start) populates the snapshot dropdowns
automatically.

---

## Quick start

```bash
# 1. Create your environment file and set your own credentials
cp .env.example .env
$EDITOR .env          # replace every CHANGE_ME value

# 2. Set the login passwords in users/seed.sql (replace every CHANGE_ME)
$EDITOR users/seed.sql

# 3. Build and start all containers
docker-compose up --build

# 4. Open the dashboard
#    http://localhost  →  redirects to /login automatically
```

> `TOY_SECRET` must be identical in `.env` and in `html/js/auth.js`. Both ship
> with a `CHANGE_ME` placeholder and the stack will not authenticate until you
> set a real value in both places.

The MySQL container initialises the database from `users/seed.sql` on the
**first start only**. Subsequent restarts reuse the persisted volume
`hei_db_data`.

---

## User management

### Adding a new user

Open `users/seed.sql` and append an `INSERT` at the bottom:

```sql
INSERT INTO users (username, password, role, country, display_name) VALUES
  ('admin@myuniversity.no', '<your-password-or-bcrypt-hash>', 'regional', 'no', 'My University Admin');
```

Then reset the database volume so MySQL re-runs the seed file:

```bash
docker-compose down -v          # removes hei_db_data, all user data is lost
docker-compose up --build       # re-creates from seed.sql
```

### Modifying a user without resetting the volume

Connect directly to the running container:

```bash
docker exec -it hei-dashboard-db \
  mysql -u hei_app -p hei_dashboard   # prompts for MYSQL_PASSWORD
```

Then run SQL inside the MySQL shell:

```sql
-- Change a password
UPDATE users SET password = 'newpassword' WHERE username = 'admin@hiof.no';

-- Add a new user
INSERT INTO users (username, password, role, country, display_name) VALUES
  ('admin@example.no', 'pass2026', 'regional', 'no', 'Example University Admin');

-- Deactivate a user (soft delete, they cannot log in but the row is kept)
UPDATE users SET active = 0 WHERE username = 'admin@uio.no';

-- Permanently remove a user
DELETE FROM users WHERE username = 'admin@example.no';
```

### Seeded accounts

`users/seed.sql` creates three example accounts. Their passwords are shipped as
`CHANGE_ME` placeholders and must be replaced before the first `docker-compose up`.

| Username        | Password   | Role           | Country |
|-----------------|------------|----------------|---------|
| `admin`         | CHANGE_ME  | Global Admin   |         |
| `admin@hiof.no` | CHANGE_ME  | Regional Admin | Norway  |
| `admin@uio.no`  | CHANGE_ME  | Regional Admin | Norway  |

### Roles

| Tab                | Global Admin | Regional Admin |
|--------------------|:------------:|:--------------:|
| Data Management    | ✓            |                |
| Overview           | ✓            | ✓              |
| HTTPS / TLS        | ✓            | ✓              |
| DNSSEC             | ✓            | ✓              |
| Security Headers   | ✓            | ✓              |
| Institutions Table | ✓            | ✓              |
| NUTS2 Map          | ✓            | ✓              |
| Report (PDF)       | ✓            |                |

### Own-institution detection

When a Regional Admin logs in with an institutional email (e.g.
`admin@hiof.no`), the platform extracts the domain (`hiof.no`) and matches it
against the `url` column of each institution in the CSV (e.g. `www.hiof.no`).
The matched institution is shown unblurred in the Institutions Table and
highlighted in the rank banner. No manual `institution` field is required in
the database.

### Production passwords (bcrypt)

`.env.example` ships with `USE_BCRYPT=1`. Setting `USE_BCRYPT=0` falls back to
plain-text comparison, which is only acceptable on a throwaway localhost
instance. To use bcrypt hashing:

1. Generate a hash:

```bash
python3 -c "import bcrypt; print(bcrypt.hashpw(b'mypassword', bcrypt.gensalt(12)).decode())"
```

2. Store the hash in the database instead of the plain-text password.

3. Set `USE_BCRYPT=1` in `.env` and restart the stack:

```bash
docker-compose down && docker-compose up --build
```

---

## MySQL setup reference

### Environment variables (`.env`)

Copy `.env.example` to `.env` and set every `CHANGE_ME` value.

| Variable              | Shipped value   | Description                              |
|-----------------------|-----------------|------------------------------------------|
| `MYSQL_ROOT_PASSWORD` | `CHANGE_ME`     | MySQL root password (internal)           |
| `MYSQL_DATABASE`      | `hei_dashboard` | Database name                            |
| `MYSQL_USER`          | `hei_app`       | Application user                         |
| `MYSQL_PASSWORD`      | `CHANGE_ME`     | Application user password                |
| `USE_BCRYPT`          | `1`             | `1` to verify passwords as bcrypt hashes |
| `SESSION_SECONDS`     | `28800`         | Token lifetime in seconds (8 hours)      |
| `TOY_SECRET`          | `CHANGE_ME`     | HMAC signing secret, must match `html/js/auth.js` |

### Connecting to the database manually

```bash
# Via docker exec (no port exposed on the host)
docker exec -it hei-dashboard-db \
  mysql -u hei_app -p hei_dashboard   # prompts for MYSQL_PASSWORD

# Show all users
SELECT id, username, role, country, active, created_at FROM users;

# Show the schema
DESCRIBE users;
```

### Resetting the database

```bash
docker-compose down -v        # remove hei_db_data named volume
docker-compose up --build     # rebuild from users/seed.sql
```

### Changing the signing secret

Edit `.env` and update `TOY_SECRET`. The same value must be set in both the
backend (`.env`) and the frontend (`html/js/auth.js`, constant `TOY_SECRET`).
After changing, all existing sessions become invalid and users must log in
again.

```bash
docker-compose down && docker-compose up --build
```

---

## Loading data

### 1. Drop files into `data/` (auto-loaded on login)

The `data/` directory is bind-mounted read-only into the container. On login
the frontend calls `GET /data`, the server walks the directory recursively,
and every recognised CSV is returned for client-side parsing.

```
data/
├── no-heis-2026.csv                              # HEI source list
├── dnssec_consolidated_result.csv
├── https_consolidate_result.csv
└── sh_final_result_with_scores_unique_hei.csv
```

(Illustrative; the directory ships empty.)

Country is detected automatically from the `country` column or the `NUTS2`
column prefix. Multiple countries can coexist under separate subdirectories:

```
data/
├── no/
│   └── dnssec_consolidated_result.csv
└── de/
    └── dnssec_consolidated_result.csv
```

### 2. Manual upload (Global Admin only)

Use the **Data Management** tab to upload the full `src/` directory from
the HEI Security Scanner project, or individual CSV files.

### Recognised filenames

| Filename pattern | Scanner / purpose |
|---|---|
| `dnssec_consolidated_result.csv` | DNSSEC scanner, consolidated |
| `https_consolidate_result.csv` | HTTPS/TLS scanner, consolidated |
| `sh_final_result_with_scores_unique_hei.csv` | Security Headers, scored |
| `*heis*.csv` | HEI source list |
| `*_dnssec_scanner.csv` | Per-scan DNSSEC (skipped if consolidated present) |
| `*_https_scanner.csv` | Per-scan HTTPS (skipped if consolidated present) |
| `risk_analysis_summary_*.csv` | LLM risk analysis output (enables AI recommendations) |

---

## Architecture

```
Browser
  └── /login  →  POST /auth  →  MySQL (hei_dashboard.users)
  └── /        →  GET /data   →  data/ bind-mount (read-only)
                 GET /geo.geojson  →  Eurostat GISCO (cached)
                 POST /upload      →  manual CSV upload

Containers
  ├── hei-dashboard-nginx   (port 80/443 → app:8080)
  ├── hei-dashboard-app     (Python wsgiref, port 8080)
  └── hei-dashboard-db      (MySQL 8.4, internal only)
```

### HTTP routes

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/`                     | Main dashboard |
| `GET`  | `/login`                | Login page |
| `POST` | `/auth`                 | Credential validation against MySQL |
| `GET`  | `/data`                 | Auto-load CSVs from `data/` |
| `GET`  | `/geo.geojson?country=` | NUTS2 GeoJSON |
| `POST` | `/upload`               | Manual CSV upload |

---

## Enabling HTTPS

Place certificate files in `certs/`:

| File | Description |
|---|---|
| `certs/fullchain.pem` | Full certificate chain |
| `certs/privkey.pem`   | Private key |

Edit `nginx/nginx.conf`: uncomment the HTTPS server block and the HTTP→HTTPS
redirect, then restart:

```bash
docker-compose down && docker-compose up --build
```

### Let's Encrypt

```bash
sudo certbot certonly --standalone -d yourdomain.com
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem certs/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem   certs/
```

### Self-signed (local testing)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/privkey.pem \
  -out certs/fullchain.pem \
  -subj "/CN=localhost"
```

---

## Project structure

```
hei-security-dashboard/
├── server.py               Python backend
├── Dockerfile
├── docker-compose.yml      app + nginx + db
├── requirements.txt        PyMySQL, bcrypt
├── .env.example            Template for .env (MySQL credentials and config)
├── README.md
├── data/                   Drop CSVs here, auto-loaded on login (ships empty)
├── cache/                  GeoJSON cache (ships empty)
├── users/
│   ├── seed.sql            Database schema and user accounts
│   └── README.md           User management guide
├── html/
│   ├── index.html          Main dashboard
│   ├── login.html          Login page (calls POST /auth)
│   ├── js/                 Frontend modules (auth, map, charts, report, builders)
│   ├── style/              Stylesheets
│   └── geo/
│       └── no.geojson      Bundled Norway NUTS2 geometry
└── nginx/
    └── nginx.conf
```

---

## Scoring reference

### HTTPS / TLS

| Grade | Score     | Interpretation |
|-------|-----------|----------------|
| A+    | 93-96 + extras | TLS 1.2/1.3 only, OCSP stapling and/or DNS CAA |
| A     | 93-96     | TLS 1.2/1.3 only, valid certificate |
| B     | 88-94     | TLS 1.0 or 1.1 still enabled |
| C-F   | < 88      | Legacy protocols or certificate problems |

### DNSSEC

| Grade | Score  | Interpretation |
|-------|--------|----------------|
| A     | 88-100 | ECDSAP256SHA256 (alg. 13), RFC 8624 RECOMMENDED |
| B     | 75-87  | ED25519 or RSA with strong digest |
| C     | 50-74  | Deprecated algorithm |
| F     | 0      | DNSSEC not deployed |

### HTTP Security Headers

`final_score = header_component × 0.60 + redirect_component × 0.40`

| Grade | Score | Interpretation |
|-------|-------|----------------|
| A     | ≥ 80  | Most headers present and correctly configured |
| B     | 65-79 | Core headers present; advanced headers missing |
| C     | 50-64 | Partial header coverage |
| D     | 40-49 | Minimal coverage |
| E     | 33-39 | Very few headers |
| F     | < 33  | No HTTPS redirect or almost no security headers |

### Composite ranking

The `#` column in the Institutions Table uses a weighted composite score,
ordered high-to-low. The rank number is stable regardless of the display sort
direction.

```
S_final      = HTTPS_domain × 0.80 + DNSSEC × 0.20
HTTPS_domain = TLS_score    × 0.80 + Headers_score × 0.20
```

Expanded: `S_final = TLS × 0.64 + Headers × 0.16 + DNSSEC × 0.20`

If scanner data is missing for a component, the remaining weights are
renormalized to sum to 1 so that partial datasets still produce a meaningful
score.

---

## References

### Core research

- Barreto et al. (2024). *Automated Assessment of Web Security in Higher Education Institutions*. ICISSP 2024.
- Directive (EU) 2022/2555 (NIS2) — https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2555
- Eurostat GISCO NUTS 2021 — https://gisco-services.ec.europa.eu/distribution/v2/nuts/
- SSB NUTS classification 508 — https://www.ssb.no/en/klass/klassifikasjoner/508

### HTTPS / TLS

- RFC 2818 — HTTP Over TLS. IETF, 2000. https://www.rfc-editor.org/rfc/rfc2818
- RFC 8996 — Deprecating TLS 1.0 and TLS 1.1. IETF, 2021. https://www.rfc-editor.org/rfc/rfc8996
- RFC 6066 — TLS Extensions: Extension Definitions (includes OCSP Stapling). IETF, 2011. https://www.rfc-editor.org/rfc/rfc6066
- RFC 7469 — Public Key Pinning Extension for HTTP. IETF, 2015. https://www.rfc-editor.org/rfc/rfc7469
- RFC 6844 — DNS Certification Authority Authorization (CAA) Resource Record. IETF, 2013. https://www.rfc-editor.org/rfc/rfc6844
- RFC 9162 — Certificate Transparency Version 2.0. IETF, 2021. https://www.rfc-editor.org/rfc/rfc9162
- testssl.sh — TLS/SSL scanner used to produce HTTPS scan results. https://testssl.sh/

### HSTS

- RFC 6797 — HTTP Strict Transport Security (HSTS). IETF, 2012. https://www.rfc-editor.org/rfc/rfc6797
- MDN Web Docs — Strict-Transport-Security. https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security

### DNSSEC

- RFC 4033 — DNS Security Introduction and Requirements. IETF, 2005. https://www.rfc-editor.org/rfc/rfc4033
- RFC 4034 — Resource Records for the DNS Security Extensions. IETF, 2005. https://www.rfc-editor.org/rfc/rfc4034
- RFC 4035 — Protocol Modifications for the DNS Security Extensions. IETF, 2005. https://www.rfc-editor.org/rfc/rfc4035
- RFC 5155 — DNS Security (DNSSEC) Hashed Authenticated Denial of Existence (NSEC3). IETF, 2008. https://www.rfc-editor.org/rfc/rfc5155
- RFC 8624 — Algorithm Implementation Requirements for DNSSEC. IETF, 2019. https://www.rfc-editor.org/rfc/rfc8624
- ICANN DNSSEC Resource Center — https://www.icann.org/resources/pages/dnssec-what-is-it-why-important-2019-03-05-en

### HTTP Security Headers

- RFC 7034 — HTTP Header Field X-Frame-Options. IETF, 2013. https://www.rfc-editor.org/rfc/rfc7034
- RFC 7762 — HTTP Header Field X-Content-Type-Options. IETF (informational). https://www.rfc-editor.org/rfc/rfc7762
- W3C Content Security Policy Level 3 — https://www.w3.org/TR/CSP3/
- Fetch Metadata Request Headers (W3C) — https://www.w3.org/TR/fetch-metadata/
- MDN Web Docs — HTTP Security Headers guide. https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers#security
- OWASP Secure Headers Project — https://owasp.org/www-project-secure-headers/
- securityheaders.com — Online header scanner and scoring reference. https://securityheaders.com/
