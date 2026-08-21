// ============================================================================
// Aggregation helpers
// ============================================================================

function normCat(rows) {
  if (!rows) return null;
  return rows.map((r) => {
    const c = { ...r };
    if (c.Category)
      c.Category =
        c.Category.trim().charAt(0).toUpperCase() +
        c.Category.trim().slice(1).toLowerCase();
    return c;
  });
}
function countTrue(rows, col) {
  if (!rows) return 0;
  return rows.filter(
    (r) =>
      String(r[col] || "")
        .trim()
        .toLowerCase() === "true",
  ).length;
}
function valCounts(rows, col) {
  const m = {};
  rows.forEach((r) => {
    const v = r[col] || "";
    m[v] = (m[v] || 0) + 1;
  });
  return m;
}
function gradeDistObj(rows) {
  const vc = valCounts(rows, "grade");
  const o = {};
  GO.forEach((g) => (o[g] = vc[g] || 0));
  return o;
}
function avgBy(rows, groupCol, valCol) {
  const sums = {},
    counts = {};
  rows.forEach((r) => {
    const g = r[groupCol] || "Unknown",
      v = parseFloat(r[valCol]);
    if (isNaN(v)) return;
    sums[g] = (sums[g] || 0) + v;
    counts[g] = (counts[g] || 0) + 1;
  });
  const out = {};
  for (const k in sums)
    out[k] = Math.round((sums[k] / counts[k]) * 100) / 100;
  return out;
}
function groupCount(rows, g1, g2) {
  const m = {};
  rows.forEach((r) => {
    const k1 = r[g1] || "Unknown",
      k2 = r[g2] || "Unknown";
    if (!m[k1]) m[k1] = {};
    m[k1][k2] = (m[k1][k2] || 0) + 1;
  });
  return m;
}
function gc(g) {
  return (
    { "A+": "ap", A: "a", B: "b", C: "c", D: "d", E: "e", F: "f" }[g] ||
    "na"
  );
}
function sCard(l, v, s, delta) {
  return `<div class="sc"><div class="l">${l}</div><div class="v mono">${v}${delta ? " " + delta : ""}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
}
function cCard(id, t) {
  return `<div class="cc"><h3>${t}</h3><canvas id="${id}"></canvas></div>`;
}

// Composite score: S_final = TLS*0.64 + Headers*0.16 + DNSSEC*0.20
// Requires all three domains to have actually run for this institution
// (TLS, Headers, DNSSEC each have a row — field is not `undefined`). If any
// domain never produced a row at all (e.g. the HTTPS/Headers scan timed out
// or errored and only exists in that scanner's *_errors_ file, never in its
// results file), the assessment is incomplete: return NaN rather than
// renormalizing over whatever did run. Renormalizing let institutions whose
// site was entirely unreachable outrank fully-tested ones on a technicality
// (100/100 from DNSSEC alone, since DNSSEC is checked at the DNS level and
// doesn't need the web server to respond).
// A scanner that DID run but found nothing usable (e.g. a host with no
// HTTPS support at all — present in the CSV with an empty final_score) is a
// confirmed failure, not a missing domain, and still scores 0 in that
// weight — parseFloat(...) || 0 below handles that case.
// Row shape expected: { hs_: TLS final_score, shs: Headers final_score, ds: DNSSEC score },
// with a field left as `undefined` (not "") when that scanner has no row for this ID at all.
function compositeScore(r) {
  const hasHs = r.hs_ !== undefined, hasSh = r.shs !== undefined, hasDs = r.ds !== undefined;
  if (!hasHs || !hasSh || !hasDs) return NaN;
  const hs = parseFloat(r.hs_) || 0;
  const sh = parseFloat(r.shs) || 0;
  const ds = parseFloat(r.ds)  || 0;
  const httpsScore = hs * 0.8 + sh * 0.2;
  return httpsScore * 0.8 + ds * 0.2;
}

// Returns the mean composite score across all institutions for a given country.
// Merges dn/ht/hd rows by institution ID, same pattern as institution-table.js.
function avgCompositeForCountry(cc) {
  const db = getDB(cc);
  const dn = db.dnssec, ht = db.https, hd = db.headers;
  if (!dn && !ht && !hd) return null;
  const byId = {};
  (dn || ht || hd).forEach((r) => {
    const id = (r.ID || r.ETER_ID || "").toString().trim().toUpperCase();
    if (!id || byId[id]) return;
    byId[id] = { ...r };
  });
  if (dn) dn.forEach((r) => { const row = byId[(r.ID || "").toString().trim().toUpperCase()]; if (row) row.ds  = r.score; });
  if (ht) ht.forEach((r) => { const row = byId[(r.ID || "").toString().trim().toUpperCase()]; if (row) row.hs_ = r.final_score; });
  if (hd) hd.forEach((r) => { const row = byId[(r.ID || "").toString().trim().toUpperCase()]; if (row) row.shs = r.final_score; });
  const scores = Object.values(byId).map(compositeScore).filter((v) => !isNaN(v));
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}
