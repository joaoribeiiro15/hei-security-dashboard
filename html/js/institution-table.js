// ============================================================================
// Institutions Table
// ============================================================================
let _tableSortAsc = false; // false = High to Low, true = Low to High
let _tablePageSize = 15;
let _tablePageCurrent = 1;
let _tableSearch = ""; // active search query, applied before pagination

// Paper grade thresholds for the final composite score [0-100]:
// A [80-100], B [65-79], C [50-64], D [35-49], E [20-34], F [0-19]
function _compGrade(score) {
  if (isNaN(score) || score == null) return "—";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  if (score >= 20) return "E";
  return "F";
}

// Shared logic: given a table target and a rebuild function, find the user's
// row, set the correct page, rebuild, then scroll-highlight.
function _scrollToOwnRowInTable(targetId, rankBy, buildFn, filterFn) {
  const a = _tableArgs();
  const filt = filterFn || (x => x);
  const dn = filt(a.dn), ht = filt(a.ht), hd = filt(a.hd), src = filt(a.src);
  const candidates = [src, dn, ht, hd].filter(Boolean);
  if (!candidates.length) return;
  function normId(v) { return v ? String(v).trim().toUpperCase() : ""; }
  const byId = {};
  candidates.forEach(rows => rows.forEach(r => {
    const key = normId(r.ID);
    if (!key || byId[key]) return;
    byId[key] = { ...r, url: r.url || r.Url || r.URL || "" };
  }));
  if (dn) dn.forEach(r => { const row = byId[normId(r.ID)]; if (row) row.ds = r.score; });
  if (ht) ht.forEach(r => { const row = byId[normId(r.ID)]; if (row) row.hs_ = r.final_score; });
  if (hd) hd.forEach(r => { const row = byId[normId(r.ID)]; if (row) row.shs = r.final_score; });
  const rf = rankBy || "_comp";
  const ranked = Object.values(byId)
    .map(r => ({ ...r, _comp: compositeScore(r) }))
    .sort((a, b) => { const av = parseFloat(a[rf]), bv = parseFloat(b[rf]); return (isNaN(bv) ? -Infinity : bv) - (isNaN(av) ? -Infinity : av); });
  ranked.forEach((r, i) => { r._rank = i + 1; });
  const displayRows = _tableSortAsc ? ranked.slice().reverse() : ranked;
  const ownIdx = displayRows.findIndex(_ownInstitutionMatch);
  if (ownIdx === -1) return;
  _tablePageCurrent = Math.floor(ownIdx / _tablePageSize) + 1;
  buildFn();
  requestAnimationFrame(() => {
    const cell = document.querySelector("#" + targetId + " #tb tr td.rnk.own");
    if (cell) _doScrollHighlight(cell.closest("tr"));
  });
}

// Scroll to the user's row in whichever table is currently on screen.
function scrollToOwnRow() {
  const rankByMap = { global: null, https: "hs_", dnssec: "ds", headers: "shs" };
  const sub = activeSub;
  const rankBy = rankByMap[sub] || null;
  if (activeScope === "national") {
    const targetId = sub === "global" ? "nttw" : "nttw-" + sub;
    _scrollToOwnRowInTable(targetId, rankBy, () => buildNational(sub));
  } else if (activeScope === "regional") {
    const selId = "r-nuts2-" + sub;
    const selEl = document.getElementById(selId);
    const nuts2 = selEl ? selEl.value : "";
    const filterFn = nuts2 ? rows => rows && rows.filter(r => r.NUTS2_Label === nuts2) : null;
    const targetId = sub === "global" ? "rittw-glb" : "rittw-" + sub;
    _scrollToOwnRowInTable(targetId, rankBy, () => buildRegional(sub), filterFn);
  } else {
    // Institution scope has no full ranked table — jump to the national one.
    scrollToOwnRowInScope("national");
  }
}

// Navigate to a different scope and scroll to the user's row there.
function scrollToOwnRowInScope(scope) {
  navigate(scope, "global");
  requestAnimationFrame(() => {
    const targetId = scope === "national" ? "nttw" : "rittw-glb";
    let filterFn = null;
    if (scope === "regional") {
      const selEl = document.getElementById("r-nuts2-global");
      const nuts2 = selEl ? selEl.value : "";
      if (nuts2) filterFn = rows => rows && rows.filter(r => r.NUTS2_Label === nuts2);
    }
    const buildFn = scope === "national" ? () => buildNational("global") : () => buildRegional("global");
    _scrollToOwnRowInTable(targetId, null, buildFn, filterFn);
  });
}

function _doScrollHighlight(row) {
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.remove("highlight-own");
  void row.offsetWidth;
  row.classList.add("highlight-own");
  row.addEventListener(
    "animationend",
    () => row.classList.remove("highlight-own"),
    { once: true },
  );
}

function _emailDomain(email) {
  if (!email || !email.includes("@")) return null;
  return email.split("@")[1].toLowerCase();
}

// ── Per-card AI recommendation injection ─────────────────────────────────
// Holds the LLM row for the institution currently being rendered.
// Set by _setCurrentLlmFindings() before each audit render.
let _currentLlmFindings = []; // kept for Findings_JSON path (future-proofing)
let _currentLlmRec = null;    // full LLM row for the current institution

// Maps card title keywords → [exact LLM test name, ...Top_Recommendations keywords]
// First element: exact test name used in Findings_JSON (from script's scoring table).
// Remaining elements: keywords to match against Top_Recommendations text (fallback).
const _CARD_TO_LLM = [
  ["certificate transparency",         "Certificate Transparency",                    ["certificate transparency", "ct log"]],
  ["dns caa",                          "CAA Records",                                 ["caa"]],
  ["ocsp stapling",                    "OCSP Stapling",                               ["ocsp"]],
  ["tls 1.3",                          "TLS 1.3 Supported",                           ["tls 1.3"]],
  ["legacy protocol",                  "TLS 1.0 / 1.1 Disabled",                     ["tls 1.0", "tls 1.1", "legacy"]],
  ["tls protocol support",             "TLS 1.0 / 1.1 Disabled",                     ["tls 1.0", "tls 1.1", "legacy"]],
  ["sslv3",                            "SSLv3 Disabled",                              ["sslv3", "ssl 3"]],
  ["https grade",                      "HTTPS Grade A or Better",                     ["https grade", "ssl grade"]],
  ["hsts deployment",                  "HSTS Header Present (HTTPS)",                 ["hsts", "strict-transport"]],
  ["hsts deployment",                  "Strict-Transport-Security",                   ["hsts", "strict-transport"]],
  ["hsts support",                     "HSTS Header Present (HTTPS)",                 ["hsts", "strict-transport"]],
  ["hsts support",                     "Strict-Transport-Security",                   ["hsts", "strict-transport"]],
  ["http/2",                           "HTTP/2 Support",                              ["http/2", "http2"]],
  ["http2",                            "HTTP/2 Support",                              ["http/2", "http2"]],
  ["https redirect",                   "HTTPS Redirect",                              ["https redirect", "redirect to https"]],
  ["http → https",                     "HTTPS Redirect",                              ["https redirect", "redirect to https"]],
  ["redirect to https",                "HTTPS Redirect",                              ["https redirect", "redirect to https"]],
  ["tls connection",                   "Valid TLS Certificate",                       ["tls", "https", "certificate"]],
  ["https connection",                 "Valid TLS Certificate",                       ["tls", "https", "certificate"]],
  ["https response",                   "Valid TLS Certificate",                       ["tls", "https", "certificate"]],
  ["certificate validation",           "Valid TLS Certificate",                       ["certificate", "tls"]],
  ["strict-transport-security",        "Strict-Transport-Security",                   ["hsts", "strict-transport"]],
  ["content security policy",          "Content Security Policy (CSP)",               ["content security policy", "csp"]],
  ["content-security-policy",          "Content Security Policy (CSP)",               ["content security policy", "csp"]],
  ["x-frame-options",                  "X-Frame-Options",                             ["x-frame-options", "clickjack"]],
  ["x-content-type-options",           "X-Content-Type-Options",                      ["x-content-type-options", "mime"]],
  ["referrer-policy",                  "Referrer Policy",                             ["referrer"]],
  ["referrer policy",                  "Referrer Policy",                             ["referrer"]],
  ["permissions-policy",               "Permissions Policy",                          ["permissions-policy", "permissions policy"]],
  ["permissions policy",               "Permissions Policy",                          ["permissions-policy", "permissions policy"]],
  ["cross-origin-opener-policy",       "Cross-Origin-Opener-Policy",                  ["cross-origin-opener", "coop"]],
  ["cross-origin-embedder-policy",     "Cross-Origin-Embedder-Policy",                ["cross-origin-embedder", "coep"]],
  ["cross-origin-resource-policy",     "Cross-Origin-Resource-Policy",                ["cross-origin-resource", "corp"]],
  ["access-control-allow-origin",      "Access-Control-Allow-Origin (CORS)",          ["cors", "access-control"]],
  ["set-cookie",                       "Set-Cookie Security",                         ["cookie", "set-cookie"]],
  ["x-xss-protection",                 "X-XSS-Protection",                            ["x-xss-protection", "xss"]],
  ["dnssec status",                    "DNSSEC Signed",                               ["dnssec"]],
  ["dnssec deployment",                "DNSSEC Signed",                               ["dnssec"]],
  ["algorithm compliance",             "DNSSEC Algorithm Strength",                   ["dnssec algorithm", "algorithm strength"]],
  ["signing algorithm",                "DNSSEC Algorithm Strength",                   ["dnssec algorithm", "algorithm strength"]],
  ["non-existence proof",              "NSEC3 Used (Not NSEC)",                       ["nsec3", "nsec"]],
  // broad fallbacks — must be last
  ["certificate",                      "Valid TLS Certificate",                       ["certificate", "tls"]],
  ["dnssec",                           "DNSSEC Signed",                               ["dnssec"]],
];

// The LLM analysis pipeline (_normalise_df in final_score.py) prefixes a
// country code onto any *purely numeric* source ID before merging countries
// together, to keep IDs unique across countries that both happen to use bare
// integers (currently Poland: "1" -> "PL-1"). Norway's own IDs are already
// "NO-HEI-001" and never match the purely-numeric case, so they pass through
// untouched. Every other dataset (source list, https/dnssec/headers scanner
// output) keeps the original bare ID, so any HEI_ID coming from the LLM CSV
// must have that synthetic prefix undone before it can be compared.
function _stripLlmCountryPrefix(heiId, cc) {
  const s = String(heiId || "").trim().toUpperCase();
  const prefix = cc ? String(cc).toUpperCase() + "-" : "";
  if (prefix && s.startsWith(prefix) && /^\d+$/.test(s.slice(prefix.length))) {
    return s.slice(prefix.length);
  }
  return s;
}

function _setCurrentLlmFindings(heiId) {
  _currentLlmFindings = [];
  _currentLlmRec = null;
  if (!heiId || !activeCountry) return;
  const rows = (getDB(activeCountry).llm) || [];
  const normId = String(heiId).trim().toUpperCase();
  const rec = rows.find((r) => _stripLlmCountryPrefix(r.HEI_ID, activeCountry) === normId);
  if (!rec) return;
  _currentLlmRec = rec;
  // Also support Findings_JSON if present (structured per-check data)
  if (rec.Findings_JSON) {
    try {
      _currentLlmFindings = JSON.parse(rec.Findings_JSON)
        .filter((f) => f.passed === false || f.passed === "false" || f.passed === 0);
    } catch (e) { _currentLlmFindings = []; }
  }
}

function _findLlmFinding(cardTitle) {
  const low = cardTitle.toLowerCase();

  // 1. Exact test-name match against Findings_JSON (per-institution LLM analysis)
  if (_currentLlmFindings.length) {
    for (const [keyword, testName] of _CARD_TO_LLM) {
      if (low.includes(keyword)) {
        const found = _currentLlmFindings.find(
          (f) => (f.test || "") === testName
        );
        if (found) return found;
      }
    }
  }

  // 2. Keyword search through Top_Recommendations (fallback when Findings_JSON absent)
  if (_currentLlmRec && _currentLlmRec.Top_Recommendations) {
    const topRecs = _currentLlmRec.Top_Recommendations
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const [keyword, , ...terms] of _CARD_TO_LLM) {
      if (low.includes(keyword)) {
        const match = topRecs.find((r) =>
          terms.some((t) => r.toLowerCase().includes(t))
        );
        if (match) return { reason: "", recommendation: match };
      }
    }
  }

  return null;
}

// Static fallback recommendations shown when no LLM data is available for an institution.
// Each entry: [keyword (lowercase), {reason, recommendation}]
function _ownInstitutionMatch(r) {
  if (!AUTH) return false;
  // Option B: match by email domain against the institution's URL field
  const domain = _emailDomain(AUTH.sub);
  if (domain) {
    const url = String(r.url || r.Url || r.URL || "")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "");
    const rDomain = url.split("/")[0];
    if (rDomain && (rDomain === domain || rDomain.endsWith("." + domain)))
      return true;
  }
  // Fallback: match by institution field against Name (legacy)
  if (AUTH.institution) {
    const needle = AUTH.institution.toLowerCase();
    const name = String(r.Name || "").toLowerCase();
    if (name.includes(needle)) return true;
  }
  return false;
}

// Returns {dn,ht,hd,da,src,llm} for the currently active country
function _tableArgs() {
  const db = getDB(activeCountry);
  return {
    dn: normCat(db.dnssec),
    ht: normCat(db.https),
    hd: normCat(db.headers),
    src: normCat(db.source),
    llm: db.llm || null,
  };
}

function bTable(dn, ht, hd, da, src, llm, opts) {
  opts = opts || {};
  const targetId = opts.targetId || "ttw";
  const searchId = opts.searchId || "ts";
  const visibleCols = opts.cols ? new Set(opts.cols) : null;
  const el = document.getElementById(targetId);
  // Use the largest available dataset as the base set of institutions
  const candidates = [src, dn, ht, hd, da].filter(Boolean);
  if (candidates.length === 0) {
    el.innerHTML = '<div class="lm">No data available.</div>';
    return;
  }
  const base = candidates.reduce((a, b) => (b.length > a.length ? b : a));

  // Normalise an ID string for matching (trim, uppercase)
  function normId(v) {
    return v ? String(v).trim().toUpperCase() : "";
  }

  // Build byId from ALL sources so every institution appears in the table
  const byId = {};
  function ensureRow(r) {
    const key = normId(r.ID);
    if (!key) return null;
    if (!byId[key])
      byId[key] = {
        ID: r.ID,
        Name: "",
        Category: "",
        NUTS2_Label: "",
        url: "",
      };
    const row = byId[key];
    if (!row.Name && r.Name) row.Name = r.Name;
    if (!row.Category && r.Category) row.Category = r.Category;
    if (!row.NUTS2_Label && r.NUTS2_Label)
      row.NUTS2_Label = r.NUTS2_Label;
    if (!row.url && (r.url || r.Url || r.URL))
      row.url = r.url || r.Url || r.URL || "";
    return row;
  }
  // Populate from all sources (src first so its metadata wins)
  [src, dn, ht, hd, da]
    .filter(Boolean)
    .forEach((rows) => rows.forEach(ensureRow));

  // Attach scanner scores
  if (dn)
    dn.forEach((r) => {
      const row = byId[normId(r.ID)];
      if (row) {
        row.dg = r.grade;
        row.ds = r.score;
        row.dst = r.dnssec_status;
      }
    });
  if (ht)
    ht.forEach((r) => {
      const row = byId[normId(r.ID)];
      if (row) {
        row.hg = r.grade;
        row.hs_ = r.final_score;
      }
    });
  if (hd)
    hd.forEach((r) => {
      const row = byId[normId(r.ID)];
      if (row) {
        row.shg = r.grade;
        row.shs = r.final_score;
      }
    });

  // Attach LLM recommendations keyed by HEI_ID (stripped of the synthetic
  // country prefix the LLM pipeline adds to bare-numeric IDs — see
  // _stripLlmCountryPrefix — so it matches row.ID from every other dataset).
  const llmMap = {};
  if (llm) {
    llm.forEach((r) => {
      const key = _stripLlmCountryPrefix(r.HEI_ID, activeCountry);
      if (key) llmMap[key] = r;
    });
  }
  // Populate modal lookups (global admin)
  if (!AUTH || AUTH.role === "global") {
    Object.assign(_aiModalData, llmMap);
  }
  Object.values(byId).forEach((row) => {
    const rec = llmMap[normId(row.ID)];
    if (rec) row._llm = rec;
  });

  // Compute composite scores and derive ranking
  const rankField = opts.rankBy || "_comp";
  const rowsAll = Object.values(byId).map((r) => ({
    ...r,
    _comp: compositeScore(r),
  }));
  const ranked = rowsAll.slice().sort((a, b) => {
    const av = parseFloat(a[rankField]);
    const bv = parseFloat(b[rankField]);
    return (isNaN(bv) ? -Infinity : bv) - (isNaN(av) ? -Infinity : av);
  });
  ranked.forEach((r, i) => {
    r._rank = i + 1;
  });
  const totalRanked = ranked.length;

  const isGlobal = !AUTH || AUTH.role === "global";
  const showId = isGlobal;

  // Store rows for global admin detail modal
  if (isGlobal) {
    ranked.forEach((r) => {
      _heiDetailRows[normId(r.ID)] = { ...r, _natTotal: totalRanked, _cc: activeCountry };
    });
    _heiDetailAllRanked = ranked.slice();
  }

  // Apply current sort direction for display, then filter by search query
  const _sortedRows = _tableSortAsc ? ranked.slice().reverse() : ranked;
  const displayRows = _tableSearch
    ? _sortedRows.filter((r) => {
        const q = _tableSearch;
        return (
          (r.ID || "").toLowerCase().includes(q) ||
          (r.Name || "").toLowerCase().includes(q) ||
          (r.Category || "").toLowerCase().includes(q) ||
          (r.NUTS2_Label || "").toLowerCase().includes(q) ||
          (r.url || "").toLowerCase().includes(q) ||
          (r.hg || "").toLowerCase().includes(q) ||
          (r.dg || "").toLowerCase().includes(q) ||
          (r.shg || "").toLowerCase().includes(q)
        );
      })
    : _sortedRows;

  // --- Rank banner (non-global roles) ---------------------------------------
  let bannerHtml = "";
  if (!isGlobal) {
    const own = ranked.find(_ownInstitutionMatch);
    if (own) {
      const natPct = Math.round((own._rank / totalRanked) * 100);
      const compStr = isNaN(own._comp) ? "—" : own._comp.toFixed(1);
      const compGradeBanner = _compGrade(own._comp);

      // Regional ranking
      const sameRegion = ranked.filter(
        (r) => r.NUTS2_Label === own.NUTS2_Label,
      );
      const regRank = sameRegion.findIndex(_ownInstitutionMatch) + 1;
      const regTotal = sameRegion.length;
      const regPct = Math.round((regRank / regTotal) * 100);

      const _bannerHead = `
          <div onclick="scrollToOwnRow()" title="Click to locate your institution in the table" style="cursor:pointer">
            <div class="rb-ttl">Your Institution <span style="font-size:.62rem;opacity:.6;margin-left:.3rem">↓ click to locate</span></div>
            <div class="rb-name">${own.Name || "—"}</div>
            <div style="font-size:.7rem;color:var(--t3);margin-top:.2rem">${own.NUTS2_Label || ""}</div>
          </div>`;
      if (opts.regionalContext) {
        bannerHtml = `
        <div class="rank-banner">
          ${_bannerHead}
          <div class="rb-stat">
            <span class="rb-val">#${own._rank}</span>
            <span class="rb-sub">Regional ranking · of ${totalRanked} · top ${natPct}%</span>
          </div>
          <div class="rb-stat">
            <span class="rb-val" style="color:${GC[compGradeBanner]||'var(--cyan)'}">Grade ${compGradeBanner} · ${compStr}</span>
            <span class="rb-sub">Final Score (HTTPS 80% + DNSSEC 20%)</span>
          </div>
        </div>`;
      } else {
        bannerHtml = `
        <div class="rank-banner">
          ${_bannerHead}
          <div class="rb-stat">
            <span class="rb-val">#${own._rank}</span>
            <span class="rb-sub">National ranking · of ${totalRanked} · top ${natPct}%</span>
          </div>
          <div class="rb-stat">
            <span class="rb-val">#${regRank}</span>
            <span class="rb-sub">Regional ranking · of ${regTotal} · top ${regPct}%</span>
          </div>
          <div class="rb-stat">
            <span class="rb-val" style="color:${GC[compGradeBanner]||'var(--cyan)'}">Grade ${compGradeBanner} · ${compStr}</span>
            <span class="rb-sub">Final Score (HTTPS 80% + DNSSEC 20%)</span>
          </div>
        </div>`;
      }
    }
  }

  const aiRecHtml = "";

  // --- Sort button ----------------------------------------------------------
  const sortBtn = `<button class="sort-btn" id="sort-btn" type="button">${_tableSortAsc ? "↑ Score: Low to High" : "↓ Score: High to Low"}</button>`;

  const cv = visibleCols;
  const sh = (k) => !cv || cv.has(k);

  // --- Table header ---------------------------------------------------------
  const hdrCells = [];
  if (sh("rank")) hdrCells.push('<th class="rnk">#</th>');
  if (showId && sh("id")) hdrCells.push("<th>ID</th>");
  if (sh("name")) hdrCells.push("<th>Name</th>");
  if (sh("cat")) hdrCells.push("<th>Category</th>");
  if (sh("nuts2")) hdrCells.push("<th>NUTS2</th>");
  const infoBtn = (k) =>
    `<button class="faq-btn" onclick="openModal('${k}')" title="Scoring guide" style="font-size:.8rem">💡</button>`;
  if (sh("https"))
    hdrCells.push(`<th>HTTPS ${infoBtn("https")}</th><th>Score</th>`);
  if (sh("dnssec"))
    hdrCells.push(
      `<th>DNSSEC ${infoBtn("dnssec")}</th><th>Score</th><th>Status</th>`,
    );
  if (sh("headers"))
    hdrCells.push(`<th>Headers ${infoBtn("headers")}</th><th>Score</th>`);
  if (!cv) hdrCells.push('<th class="gs-col">Global Score</th>');

  // --- Pagination helpers ---------------------------------------------------
  const pageSize = _tablePageSize;
  const totalPages = Math.max(
    1,
    Math.ceil(displayRows.length / pageSize),
  );
  _tablePageCurrent = Math.min(_tablePageCurrent, totalPages);
  const pageStart = (_tablePageCurrent - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const pageRows = displayRows.slice(pageStart, pageEnd);

  // --- Body rows ------------------------------------------------------------
  const bodyRows = pageRows
    .map((r) => {
      const own = _ownInstitutionMatch(r);
      const cls = isGlobal ? "" : own ? "cell-blur own" : "cell-blur";
      const safeName =
        own || isGlobal ? r.Name || "-" : "████████████████";
      const nameCell = cls
        ? `<td><span class="${cls}">${safeName}</span></td>`
        : `<td>${r.Name || "-"}</td>`;

      const compDisp = isNaN(r._comp) ? "-" : r._comp.toFixed(1);
      const compGrade = _compGrade(r._comp);

      const parts = [];
      if (sh("rank"))
        parts.push(
          `<td class="rnk ${own ? "own" : ""}">#${r._rank}</td>`,
        );
      if (showId && sh("id"))
        parts.push(`<td class="mono">${r.ID || "-"}</td>`);
      if (sh("name")) parts.push(nameCell);
      if (sh("cat")) parts.push(`<td>${r.Category || "-"}</td>`);
      if (sh("nuts2")) parts.push(`<td>${r.NUTS2_Label || "-"}</td>`);
      if (sh("https"))
        parts.push(
          `<td><span class="gb ${gc(r.hg)}">${r.hg || "-"}</span></td><td class="mono">${r.hs_ || "-"}</td>`,
        );
      if (sh("dnssec"))
        parts.push(
          `<td><span class="gb ${gc(r.dg)}">${r.dg || "-"}</span></td><td class="mono">${r.ds || "-"}</td><td>${r.dst || "-"}</td>`,
        );
      if (sh("headers"))
        parts.push(
          `<td><span class="gb ${gc(r.shg)}">${r.shg || "-"}</span></td><td class="mono">${r.shs || "-"}</td>`,
        );
      if (!cv) {
        const incompleteTitle = isNaN(r._comp)
          ? ' title="Incomplete assessment: TLS, Headers, or DNSSEC data is missing for this institution"'
          : "";
        parts.push(
          `<td class="gs-col"${incompleteTitle}><span class="gb ${gc(compGrade)}" style="margin-right:.35rem">${compGrade}</span><span class="mono" style="font-weight:700;color:var(--cyan)">${compDisp}</span></td>`,
        );
      }
      const rowClick = isGlobal
        ? ` class="clickable-row" onclick="openHeiDetail('${(r.ID || "").replace(/'/g, "\\'")}')"`
        : "";
      return `<tr${rowClick}>` + parts.join("") + "</tr>";
    })
    .join("");

  // --- Pagination controls --------------------------------------------------
  const pageSizeOptions = [10, 15, 25, 50]
    .map(
      (n) =>
        `<button class="pg-size-btn${n === pageSize ? " on" : ""}" data-ps="${n}">${n}</button>`,
    )
    .join("");

  let pageNav = "";
  if (totalPages > 1) {
    const prevDis = _tablePageCurrent <= 1 ? " disabled" : "";
    const nextDis = _tablePageCurrent >= totalPages ? " disabled" : "";
    let pageNums = "";
    for (let p = 1; p <= totalPages; p++) {
      if (
        p === 1 ||
        p === totalPages ||
        Math.abs(p - _tablePageCurrent) <= 1
      ) {
        pageNums += `<button class="pg-num-btn${p === _tablePageCurrent ? " on" : ""}" data-pg="${p}">${p}</button>`;
      } else if (Math.abs(p - _tablePageCurrent) === 2) {
        pageNums += `<span class="pg-ellipsis">…</span>`;
      }
    }
    pageNav = `
      <div class="pg-nav">
        <button class="pg-arrow-btn"${prevDis} id="pg-prev">&#8592; Prev</button>
        ${pageNums}
        <button class="pg-arrow-btn"${nextDis} id="pg-next">Next &#8594;</button>
      </div>`;
  }

  const paginationBar = `
    <div class="pagination-bar">
      <div class="pg-info">Showing ${pageStart + 1}–${Math.min(pageEnd, displayRows.length)} of ${displayRows.length} institutions</div>
      <div class="pg-size-ctrl">
        <span class="pg-size-label">Per page:</span>
        ${pageSizeOptions}
      </div>
      ${pageNav}
    </div>`;

  el.innerHTML =
    bannerHtml +
    aiRecHtml +
    `<div class="table-ctrls">${sortBtn}</div>` +
    '<div class="tw"><table><thead><tr>' +
    hdrCells.join("") +
    '</tr></thead><tbody id="tb">' +
    bodyRows +
    "</tbody></table></div>" +
    paginationBar;

  // Live search — filters all data before pagination
  const search = document.getElementById(searchId);
  if (search) {
    search.value = _tableSearch;
    search.oninput = function () {
      _tableSearch = this.value.toLowerCase().trim();
      _tablePageCurrent = 1;
      _rebuildTable();
      // Restore focus and cursor position after re-render
      const s2 = document.getElementById(searchId);
      if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
    };
  }

  // Helper: re-render this same table after pagination/sort state change
  const _rebuildTable = () => {
    const a = _tableArgs();
    bTable(a.dn, a.ht, a.hd, null, a.src, a.llm, opts);
  };

  // Sort toggle
  const btn = document.getElementById("sort-btn");
  if (btn) {
    btn.onclick = function () {
      _tableSortAsc = !_tableSortAsc;
      _tablePageCurrent = 1;
      _rebuildTable();
    };
  }

  // Pagination: page size buttons
  el.querySelectorAll(".pg-size-btn").forEach((b) => {
    b.onclick = function () {
      _tablePageSize = parseInt(this.dataset.ps);
      _tablePageCurrent = 1;
      _rebuildTable();
    };
  });

  // Pagination: prev/next
  const prevBtn = document.getElementById("pg-prev");
  const nextBtn = document.getElementById("pg-next");
  if (prevBtn)
    prevBtn.onclick = function () {
      if (_tablePageCurrent > 1) {
        _tablePageCurrent--;
        _rebuildTable();
      }
    };
  if (nextBtn)
    nextBtn.onclick = function () {
      if (_tablePageCurrent < totalPages) {
        _tablePageCurrent++;
        _rebuildTable();
      }
    };

  // Pagination: numbered page buttons
  el.querySelectorAll(".pg-num-btn").forEach((b) => {
    b.onclick = function () {
      _tablePageCurrent = parseInt(this.dataset.pg);
      _rebuildTable();
    };
  });
}
