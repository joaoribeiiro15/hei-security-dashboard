// ============================================================================
// International scope builders
// ============================================================================

// ── International country-ranking comparison table ──────────────────────
function bIntlCompTable(ccs, sub, targetId) {
  const el = document.getElementById(targetId);
  if (!el || !ccs.length) return;
  const avg = (rows, f) => { if (!rows || !rows.length) return null; const v = rows.map((r) => parseFloat(r[f])).filter((x) => !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const pctValid = (rows) => rows && rows.length ? (rows.filter((r) => r.dnssec_status === "Valid").length / rows.length) * 100 : null;
  const rows = ccs.map((cc) => {
    const db = getDB(cc), meta = countryMeta(cc);
    return {
      cc, meta,
      comp:   avgCompositeForCountry(cc),
      https:  avg(db.https, "final_score"),
      dnssec: pctValid(db.dnssec),
      dnssecScore: avg(db.dnssec, "score"),
      headers: avg(db.headers, "final_score"),
      n: (db.https || db.dnssec || db.headers || []).length,
    };
  });
  const sortKey = sub === "dnssec" ? "dnssec" : sub === "https" ? "https" : sub === "headers" ? "headers" : "comp";
  rows.sort((a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity));
  rows.forEach((r, i) => { r.rank = i + 1; });
  const isActive = (cc) => cc === activeCountry;
  const fmt = (v, suffix) => v !== null && v !== undefined && !isNaN(v) ? v.toFixed(1) + (suffix || "") : "–";
  const colHeaders = sub === "global"
    ? ["#", "Country", "Institutions", "Global Score", "HTTPS Score", "DNSSEC %", "Headers Score"]
    : sub === "https" ? ["#", "Country", "Institutions", "HTTPS Score"]
    : sub === "dnssec" ? ["#", "Country", "Institutions", "DNSSEC %", "DNSSEC Score"]
    : ["#", "Country", "Institutions", "Headers Score"];
  const bodyRows = rows.map((r) => {
    const hi = isActive(r.cc) ? ' style="background:rgba(6,182,212,.08);font-weight:600"' : "";
    const tag = isActive(r.cc) ? ' <span style="font-size:.7rem;background:rgba(6,182,212,.18);color:var(--cyan);border-radius:4px;padding:.1rem .35rem;margin-left:.3rem">This Country</span>' : "";
    const cols = sub === "global"
      ? `<td>${r.rank}</td><td>${r.meta.flag} ${r.meta.label}${tag}</td><td>${r.n}</td><td>${fmt(r.comp)}</td><td>${fmt(r.https)}</td><td>${fmt(r.dnssec, "%")}</td><td>${fmt(r.headers)}</td>`
      : sub === "https" ? `<td>${r.rank}</td><td>${r.meta.flag} ${r.meta.label}${tag}</td><td>${r.n}</td><td>${fmt(r.https)}</td>`
      : sub === "dnssec" ? `<td>${r.rank}</td><td>${r.meta.flag} ${r.meta.label}${tag}</td><td>${r.n}</td><td>${fmt(r.dnssec, "%")}</td><td>${fmt(r.dnssecScore)}</td>`
      : `<td>${r.rank}</td><td>${r.meta.flag} ${r.meta.label}${tag}</td><td>${r.n}</td><td>${fmt(r.headers)}</td>`;
    return `<tr${hi}>${cols}</tr>`;
  }).join("");
  el.innerHTML = `<div class="stl" style="font-size:.9rem;margin-bottom:.8rem"><span class="dt" style="background:var(--cyan)"></span> Country Ranking</div><div class="tw"><table class="rt"><thead><tr>${colHeaders.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
}

function bInternationalGlobal(ccs) {
  const ss = document.getElementById("intl-s"),
    sc = document.getElementById("intl-c");
  if (!ss || !sc) return;

  const avgFn = (rows, col) => {
    if (!rows || !rows.length) return null;
    const v = rows.map((r) => parseFloat(r[col])).filter((v) => !isNaN(v));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const pctFn = (rows, status, col) => {
    if (!rows || !rows.length) return null;
    return (rows.filter((r) => r[col] === status).length / rows.length) * 100;
  };
  const fmt = (v) => (v !== null && !isNaN(v) ? v.toFixed(1) : "–");

  // Stat cards: one per country showing all four key metrics
  let h = "";
  ccs.forEach((cc) => {
    const db = getDB(cc), meta = countryMeta(cc);
    const comp  = avgCompositeForCountry(cc);
    const htAvg = avgFn(db.https, "final_score");
    const dnPct = pctFn(db.dnssec, "Valid", "dnssec_status");
    const hdAvg = avgFn(db.headers, "final_score");
    h += sCard(
      meta.flag + " " + meta.label,
      comp !== null ? comp.toFixed(1) : "–",
      "Global / HTTPS " + fmt(htAvg) + " / DNSSEC " + (dnPct !== null ? Math.round(dnPct) + "%" : "–") + " / Headers " + fmt(hdAvg),
    );
  });
  ss.innerHTML = h;

  // Single-country: show summary cards and a notice instead of a grouped chart
  if (ccs.length < 2) {
    sc.innerHTML = '<p class="map-loading" style="margin:1rem 0;color:var(--t2)">Load data for at least one additional country to enable multi-country chart comparison.</p>';
    return;
  }

  // Multi-country: transposed grouped bar chart
  // x-axis = metrics, each dataset = one country
  const metricLabels = ["Global Score", "HTTPS Score", "DNSSEC Adoption %", "Headers Score"];
  const countryColors = ["#3b82f6", "#f97316", "#10b981", "#a855f7", "#ef4444", "#06b6d4"];
  const datasets = ccs.map((cc, i) => {
    const db = getDB(cc), meta = countryMeta(cc);
    const comp  = avgCompositeForCountry(cc) ?? 0;
    const ht    = avgFn(db.https, "final_score") ?? 0;
    const dn    = pctFn(db.dnssec, "Valid", "dnssec_status") ?? 0;
    const hd    = avgFn(db.headers, "final_score") ?? 0;
    return {
      label: meta.label,
      data: [comp, ht, dn, hd],
      backgroundColor: countryColors[i % countryColors.length],
      borderRadius: 4,
    };
  });

  sc.innerHTML = cCard("intl-bar", "Cross-Country Comparison — Average Scores");
  mkB("intl-bar", metricLabels, datasets);
}

function bInternationalScanner(
  ccs,
  scanner,
  chartId,
  statsId,
  col,
  unit,
) {
  const ss = document.getElementById(statsId),
    sc = document.getElementById(chartId);
  if (!ss || !sc) return;
  const avgFn = (rows) => {
    if (!rows || !rows.length) return null;
    const v = rows
      .map((r) => parseFloat(r[col]))
      .filter((v) => !isNaN(v));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const countryColors = ["#3b82f6", "#f97316", "#10b981", "#a855f7", "#ef4444", "#06b6d4"];
  const colorMap = {};
  ccs.forEach((cc, i) => { colorMap[cc] = countryColors[i % countryColors.length]; });

  const vals = ccs.map((cc) => {
    const meta = countryMeta(cc);
    const v = avgFn(getDB(cc)[scanner]);
    return { cc, flag: meta.flag, label: meta.label, v };
  });
  vals.sort((a, b) => (b.v || 0) - (a.v || 0));
  let h = "";
  vals.forEach(
    ({ flag, label, v }) => (h += sCard(flag + " " + label, v ? v.toFixed(1) : "–", unit)),
  );
  ss.innerHTML = h;
  sc.innerHTML = cCard(chartId + "-bar", "Country Ranking — " + unit);
  mkB(
    chartId + "-bar",
    vals.map((x) => x.label),
    [
      {
        label: unit,
        data: vals.map((x) => x.v || 0),
        backgroundColor: vals.map((x) => colorMap[x.cc]),
        borderRadius: 4,
      },
    ],
  );
}
