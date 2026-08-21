// ============================================================================
// Multi-country state store
// ============================================================================
// COUNTRIES[cc] = { dnssec: [], https: [], headers: [], source: [],
//                    snapshots: { dnssec: [{timestamp, rows}, ...], ... } }
const COUNTRIES = {};
let activeCountry = null; // currently displayed country code
let activeContinent = null; // continent filter: key from CONTINENT_MAP or null = all

// The snapshot the user is currently viewing (A) and an optional comparison
// snapshot (B). Timestamps from the union of stamps for activeCountry, or
// null when no comparison is active.
let activeSnapshotA = null;
let activeSnapshotB = null;

// Two-level navigation state
let activeScope = "national";
let activeSub = "global";

function getDB(cc) {
  if (!COUNTRIES[cc])
    COUNTRIES[cc] = {
      dnssec: null,
      https: null,
      headers: null,
      source: null,
      llm: null,
      snapshots: { dnssec: [], https: [], headers: [] },
    };
  // Backfill snapshots store for older in-memory databases
  if (!COUNTRIES[cc].snapshots) {
    COUNTRIES[cc].snapshots = { dnssec: [], https: [], headers: [] };
  }
  return COUNTRIES[cc];
}

// Extract the run timestamp from a parsed rows array. Three fallbacks:
// 1) run_timestamp column (preferred, injected by the unified main.py)
// 2) scan_datetime or assessment_datetime column (legacy)
// 3) null (snapshot treated as "unstamped")
function _extractRunTimestamp(rows) {
  if (!rows || !rows.length) return null;
  const r = rows[0];
  return (
    r.run_timestamp || r.scan_datetime || r.assessment_datetime || null
  );
}

// Store a parsed scanner dataset, preserving history. If a snapshot with
// the same timestamp already exists it is replaced, otherwise it is
// appended. The most recent snapshot becomes the "current" view.
// Deduplicate rows to one row per HEI (by ID), keeping the most recent
// assessment_datetime. Scanner files can be cumulative (multiple runs
// appended), so without this a file with 4 runs produces 192 rows for
// 48 HEIs, inflating every counter and average in the dashboard.
function _deduplicateByHei(rows) {
  if (!rows || !rows.length) return rows;
  const seen = new Map();
  // A row has a "valid score" when final_score (HTTPS/headers) or score (DNSSEC)
  // parses as a finite number. Rows where the scanner emitted "False" or left the
  // field blank are considered invalid and will not displace a valid row.
  const _validScore = (r) =>
    isFinite(parseFloat(r.final_score)) || isFinite(parseFloat(r.score));
  for (const r of rows) {
    const id = (r.ID || r.id || r.ETER_ID || "").toString().trim();
    if (!id) continue;
    const prev = seen.get(id);
    if (!prev) { seen.set(id, r); continue; }
    const prevOk = _validScore(prev), curOk = _validScore(r);
    // Always prefer the row with a valid score over one without
    if (curOk && !prevOk) { seen.set(id, r); continue; }
    if (!curOk && prevOk) continue;
    // Both valid or both invalid → keep the later assessment_datetime
    const dPrev = prev.assessment_datetime || "";
    const dCur = r.assessment_datetime || "";
    if (dCur > dPrev) seen.set(id, r);
  }
  // If no ID column found, return as-is (unknown format)
  return seen.size > 0 ? Array.from(seen.values()) : rows;
}

function _storeSnapshot(cc, scanner, rows) {
  const db = getDB(cc);
  if (!["dnssec", "https", "headers"].includes(scanner)) {
    db[scanner] = rows;
    return;
  }
  // Always deduplicate before storing — handles cumulative scanner outputs
  const dedupedRows = _deduplicateByHei(rows);
  const ts = _extractRunTimestamp(rows); // use original rows for ts extraction
  const bucket = db.snapshots[scanner];
  const existing = bucket.findIndex((s) => s.timestamp === ts);
  if (existing >= 0) {
    bucket[existing] = { timestamp: ts, rows: dedupedRows };
  } else {
    bucket.push({ timestamp: ts, rows: dedupedRows });
  }
  // Sort chronologically (null timestamps sink to the bottom)
  bucket.sort((a, b) => {
    if (a.timestamp === b.timestamp) return 0;
    if (a.timestamp === null) return 1;
    if (b.timestamp === null) return -1;
    return a.timestamp < b.timestamp ? -1 : 1;
  });
  // Current view = most recent snapshot (last after ascending sort,
  // but null sinks last, so pick the last non-null if possible)
  const latest =
    bucket
      .slice()
      .reverse()
      .find((s) => s.timestamp !== null) || bucket[bucket.length - 1];
  db[scanner] = latest.rows;
}
