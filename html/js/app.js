// ============================================================================
// App — view row accessors, build orchestrators, Chart.js defaults, IIFE init
// ============================================================================

// Snapshot-aware accessors used by every section. Return the rows of the
// active snapshot (A) for the given scanner, falling back to the latest
// snapshot stored in db[scanner] when no stamped snapshot is selected.
function getViewRows(scanner) {
  return _getViewRows(activeCountry, scanner);
}

// Explicit-CC version: always reads from the given country, not the global.
// Used by build functions that capture cc = activeCountry at their top so
// any mid-function change to the global (e.g. via a RAF callback) is ignored.
function _getViewRows(cc, scanner) {
  if (!cc) return null;
  const db = getDB(cc);
  if (activeSnapshotA && db.snapshots && db.snapshots[scanner]) {
    const hit = db.snapshots[scanner].find(
      (s) => s.timestamp === activeSnapshotA,
    );
    if (hit) return hit.rows;
  }
  return db[scanner] || null;
}

// Compare snapshot rows when activeSnapshotB is set and differs from A.
function getCompareRows(scanner) {
  return _getCompareRows(activeCountry, scanner);
}

function _getCompareRows(cc, scanner) {
  if (
    !cc ||
    !activeSnapshotB ||
    activeSnapshotB === activeSnapshotA
  )
    return null;
  const db = getDB(cc);
  if (db.snapshots && db.snapshots[scanner]) {
    const hit = db.snapshots[scanner].find(
      (s) => s.timestamp === activeSnapshotB,
    );
    if (hit) return hit.rows;
  }
  return null;
}

function buildCurrent() {
  charts.forEach((c) => c.destroy());
  charts = [];
  if (activeScope === "national") buildNational(activeSub);
  else if (activeScope === "regional") buildRegional(activeSub);
  else if (activeScope === "institution") buildInstitution(activeSub);
  else if (activeScope === "international") buildInternational(activeSub);
  dashDirty = false;
}

function buildAll() {
  buildCurrent();
}

function buildNational(sub) {
  // Capture cc once so every read in this call (including RAF closures) uses
  // the same country even if the user switches while an async map fetch runs.
  const cc = activeCountry;
  if (!cc) {
    ["os", "oc", "hs", "hc", "ds", "dc", "shs", "shc",
     "nttw", "nttw-https", "nttw-dnssec", "nttw-headers"].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.innerHTML =
          '<div class="lm">Select a country from the bar above.</div>';
    });
    return;
  }
  const db = getDB(cc);
  const dn = normCat(_getViewRows(cc, "dnssec")),
    ht = normCat(_getViewRows(cc, "https"));
  const hd = normCat(_getViewRows(cc, "headers"));
  const dnB = normCat(_getCompareRows(cc, "dnssec")),
    htB = normCat(_getCompareRows(cc, "https"));
  const hdB = normCat(_getCompareRows(cc, "headers"));
  const src = normCat(db.source);
  const llm = db.llm || null;
  const meta = countryMeta(cc);
  const colMap = { global: null, https: ["rank","name","cat","nuts2","https"], dnssec: ["rank","name","cat","nuts2","dnssec"], headers: ["rank","name","cat","nuts2","headers"] };
  const rankMap = { global: null, https: "hs_", dnssec: "ds", headers: "shs" };
  if (sub === "global") {
    bOverview(dn, ht, hd, meta, llm, { dnB, htB, hdB });
    const mw = document.getElementById("nat-map-wrap");
    if (mw) {
      const hasData = !!(dn || ht || hd);
      mw.style.display = hasData ? "block" : "none";
      if (hasData) {
        if (mapGeo && mapCountry === cc)
          requestAnimationFrame(() => buildMap(mapGeo, cc));
        else loadMap();
        renderMapCards(cc);
      }
    }
  } else if (sub === "https") bHttps(ht, htB, src);
  else if (sub === "dnssec") bDnssec(dn, dnB);
  else if (sub === "headers") bHeaders(hd, hdB);
  // Institution detail table below charts
  bTable(dn, ht, hd, null, src, llm, {
    cols: colMap[sub],
    targetId: sub === "global" ? "nttw" : "nttw-" + sub,
    searchId: sub === "global" ? "nts" : "nts-" + sub,
    rankBy: rankMap[sub],
  });
}

function buildRegional(sub) {
  const cc = activeCountry;
  if (!cc) return;
  const db = getDB(cc);
  const dn = normCat(_getViewRows(cc, "dnssec")),
    ht = normCat(_getViewRows(cc, "https"));
  const hd = normCat(_getViewRows(cc, "headers"));
  const dnB = normCat(_getCompareRows(cc, "dnssec")),
    htB = normCat(_getCompareRows(cc, "https"));
  const hdB = normCat(_getCompareRows(cc, "headers"));
  const src = normCat(db.source);
  const llm = db.llm || null;
  if (sub === "global") {
    // global regional overview
  } else if (sub === "https") {
    bRegionalHttps(ht, htB);
  } else if (sub === "dnssec") {
    bRegionalDnssec(dn, dnB);
  } else if (sub === "headers") {
    bRegionalHeaders(hd, hdB);
  }
  // Institution table filtered by NUTS2 region
  _bRegionalInstTable(dn, ht, hd, src, llm, sub);
}

function buildInstitution(sub) {
  const ids = ["io-s","io-c","io-rank","ih-s","ih-c","ih-rank","id-s","id-c","id-rank","ish-s","ish-c","ish-rank"];
  const noData = (msg) => ids.forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = '<div class="lm">' + msg + '</div>'; });
  if (!activeCountry) { noData("Select a country from the bar above."); return; }
  // Filter every dataset down to the user's own institution
  const own = (rows) => rows ? rows.filter(_ownInstitutionMatch) : null;
  const dn = own(normCat(getViewRows("dnssec")));
  const ht = own(normCat(getViewRows("https")));
  const hd = own(normCat(getViewRows("headers")));
  const htB = own(normCat(getCompareRows("https")));
  const dnB = own(normCat(getCompareRows("dnssec")));
  const hdB = own(normCat(getCompareRows("headers")));
  const anyData = (dn && dn.length) || (ht && ht.length) || (hd && hd.length);
  if (!anyData) { noData("No data found for your institution."); return; }
  // Clear all institution containers so stale messages from prior renders don't persist
  ids.forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  if (sub === "global") bInstGlobal(dn, ht, hd, htB, dnB, hdB);
  else if (sub === "https") bInstHttps(ht, htB, hd);
  else if (sub === "dnssec") bInstDnssec(dn, dnB, ht);
  else if (sub === "headers") bInstHeaders(hd, hdB, ht);
}

function buildInternational(sub) {
  const ccs = Object.keys(COUNTRIES);
  if (!ccs.length) return;
  if (sub === "global") { bInternationalGlobal(ccs); bIntlCompTable(ccs, "global", "intl-ct"); }
  else if (sub === "https") {
    bInternationalScanner(ccs, "https", "intl-hc", "intl-hs", "final_score", "Average Score");
    bIntlCompTable(ccs, "https", "intl-hct");
  } else if (sub === "dnssec") {
    bInternationalScanner(ccs, "dnssec", "intl-dc", "intl-ds", "score", "Average Score");
    bIntlCompTable(ccs, "dnssec", "intl-dct");
  } else if (sub === "headers") {
    bInternationalScanner(ccs, "headers", "intl-sc", "intl-ss", "final_score", "Average Score");
    bIntlCompTable(ccs, "headers", "intl-sct");
  }
}

// ==========================================================================
// Chart.js global defaults + IIFE init
// ==========================================================================
applyChartDefaults();
Chart.defaults.font.family = "'DM Sans',sans-serif";
Chart.defaults.font.size = 14;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding = 14;

// Gate the entire app behind the simulated JWT. If no valid session exists
// we bounce to /login immediately and do not initialise further. With a
// valid session, activateSession renders the chip, restricts tabs to the
// user's role, auto-loads the server-side data/ directory, and (for
// non-admin) prunes the country bar to the user's own country.
(async function () {
  try {
    if (await restoreSession()) {
      refreshStatus();
      refreshCountryBar();
      activateSession();
    }
  } catch (e) {
    console.error("[init] failed:", e);
    _hideLoadingOverlay();
  }
})();
