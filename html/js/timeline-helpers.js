// ============================================================================
// Snapshot / timeline helper functions
// (used by country-bar.js, builders/national.js, and report.js)
// ============================================================================

function _fmtTs(ts) {
  if (!ts) return "unstamped";
  // filename format: YYYY-MM-DDTHH-MM-SS
  const mf = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})$/.exec(ts);
  if (mf) return `${mf[3]}-${mf[2]}-${mf[1]} ${mf[4]}:${mf[5]}:${mf[6]}`;
  // run_timestamp format: YYYY-MM-DD HH:MM:SS[.ffffff]
  const mr = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(
    ts,
  );
  if (mr) return `${mr[3]}-${mr[2]}-${mr[1]} ${mr[4]}:${mr[5]}:${mr[6]}`;
  // date only: YYYY-MM-DD
  const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ts);
  if (md) return `${md[3]}-${md[2]}-${md[1]}`;
  return ts;
}

function _fmtTsLabel(ts, stamps) {
  const fmt = _fmtTs(ts);
  if (!stamps || !stamps.length) return fmt;
  const latest = stamps[stamps.length - 1];
  return ts === latest ? `Latest Snapshot  (${fmt})` : fmt;
}

// Aggregate one snapshot into a single headline number:
//   - dnssec: % of "Valid" HEIs
//   - https / headers: average final_score
// Returns null if the snapshot has no usable rows.
function _snapshotMetric(scanner, rows) {
  if (!rows || !rows.length) return null;
  if (scanner === "dnssec") {
    const v = rows.filter((r) => r.dnssec_status === "Valid").length;
    return Math.round((v / rows.length) * 1000) / 10;
  }
  // https / headers: average final_score
  const scores = rows
    .map((r) => parseFloat(r.final_score))
    .filter((v) => !isNaN(v));
  if (!scores.length) return null;
  return (
    Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
    10
  );
}

// Build the union of timestamps present across all four scanners for the
// given country, sorted chronologically (ascending).
function _allTimestamps(cc) {
  const db = getDB(cc);
  const set = new Set();
  ["dnssec", "https", "headers"].forEach((k) =>
    (db.snapshots[k] || []).forEach((s) => {
      if (s.timestamp) set.add(s.timestamp);
    }),
  );
  return [...set].sort();
}

// Find the rows for a given (scanner, timestamp) pair, or null.
function _rowsAt(cc, scanner, ts) {
  const bucket = getDB(cc).snapshots[scanner] || [];
  const hit = bucket.find((s) => s.timestamp === ts);
  return hit ? hit.rows : null;
}

// Stable key for an institution row: prefer ID, fall back to URL or domain.
function _heiKey(r) {
  return (r.ID || r.URL || r.url || r.domain || "")
    .toString()
    .trim()
    .toLowerCase();
}
